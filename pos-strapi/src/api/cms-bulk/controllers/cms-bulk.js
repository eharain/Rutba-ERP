'use strict';

// Bulk-import endpoint for rutba-cms Excel I/O. Single POST takes a chunk of
// rows (capped server-side at MAX_ROWS_PER_REQUEST) and upserts them inside
// a single request boundary, replacing what was previously 3 sequential HTTP
// calls per row from the browser.
//
// Contract (rows are sent as already-parsed objects so the wire format is
// position-independent — column rename is just a header-side concern):
//   POST /api/cms-bulk/import
//   Body: { contentType, items: [{ documentId?, ...fields }, ...] }
//   Response: { ok: true, total, created, updated, failed: [{ index, label, message }] }
//
// The server validates contentType against an allowlist, splits SEO fields
// off into a separate seo-meta upsert, and resolves "existing or new" by
// documentId first, then per-CT natural key (slug/sku/name).

const { ensureUser } = require('../../../utils/ensure-user');

const MAX_ROWS_PER_REQUEST = 50;

// Allowlist of importable content types. Each entry declares:
//   relation     — back-relation field on seo-meta for the SEO sidecar upsert
//   entityType   — value written to seo-meta.entity_type for filtering
//   naturalKey   — fallback dedup field when the row has no documentId
const CONTENT_TYPES = {
    'api::cms-page.cms-page':           { relation: 'cms_page',       entityType: 'cms-page',       naturalKey: 'slug' },
    'api::cms-footer.cms-footer':       { relation: null,             entityType: null,             naturalKey: 'slug' },
    'api::product.product':             { relation: 'product',        entityType: 'product',        naturalKey: 'sku'  },
    'api::brand.brand':                 { relation: 'brand',          entityType: 'brand',          naturalKey: 'slug' },
    'api::category.category':           { relation: 'category',       entityType: 'category',       naturalKey: 'slug' },
    'api::brand-group.brand-group':     { relation: 'brand_group',    entityType: 'brand-group',    naturalKey: 'slug' },
    'api::category-group.category-group': { relation: 'category_group', entityType: 'category-group', naturalKey: 'slug' },
    'api::product-group.product-group': { relation: 'product_group',  entityType: 'product-group',  naturalKey: 'slug' },
    'api::sale-offer.sale-offer':       { relation: null,             entityType: null,             naturalKey: 'name' },
    'api::delivery-method.delivery-method': { relation: null,         entityType: null,             naturalKey: 'name' },
    // Social posts: documentId-only matching (naturalKey null) — titles aren't
    // unique, so a row without a documentId always creates a new draft rather
    // than risk merging two posts that happen to share a title.
    'api::social-post.social-post':     { relation: null,             entityType: null,             naturalKey: null   },
};

const SEO_FIELDS = new Set(['meta_title', 'meta_description', 'keywords', 'noindex']);

// Strapi-managed columns that must never round-trip back from a spreadsheet.
// `parent` is included because the product export ships it as a read-only
// display column (variant→parent) — see PRODUCT_EXCEL_COLUMNS.
const READ_ONLY_FIELDS = new Set([
    'id',
    'createdAt',
    'updatedAt',
    'publishedAt',
    'createdBy',
    'updatedBy',
    'parent',
    'seo_meta',
]);

function parseBool(v) {
    if (v === true) return true;
    if (v === false) return false;
    if (v === null || v === undefined || v === '') return undefined;
    return /^(true|1|yes|y)$/i.test(String(v).trim());
}

// Excel imports lose original cell typing — a SKU like "1234" silently becomes
// the number 1234, a phone field comes in as a number, dates round-trip as
// floats, etc. Coerce each value back to the type the schema expects so
// Strapi's validators don't reject otherwise-fine rows.
function coerceForSchema(strapi, uid, key, value) {
    if (value === undefined || value === null) return value;
    const attr = strapi.contentTypes?.[uid]?.attributes?.[key];
    if (!attr) return value; // unknown field — let Strapi decide
    switch (attr.type) {
        case 'string':
        case 'text':
        case 'richtext':
        case 'uid':
        case 'email':
        case 'password':
        case 'blocks':
            return typeof value === 'string' ? value : String(value);
        case 'integer':
        case 'biginteger': {
            if (typeof value === 'number') return Math.trunc(value);
            const n = Number.parseInt(String(value).trim(), 10);
            return Number.isFinite(n) ? n : null;
        }
        case 'float':
        case 'decimal': {
            if (typeof value === 'number') return value;
            const n = Number.parseFloat(String(value).trim());
            return Number.isFinite(n) ? n : null;
        }
        case 'boolean': {
            if (typeof value === 'boolean') return value;
            if (value === '') return null;
            return /^(true|1|yes|y)$/i.test(String(value).trim());
        }
        case 'date':
        case 'datetime':
        case 'time': {
            if (typeof value === 'string') return value;
            // Excel sometimes emits dates as numbers (serial day) or ISO
            // strings via xlsx's parser; assume strings work as-is and let
            // Strapi validate.
            if (value instanceof Date) return value.toISOString();
            return String(value);
        }
        case 'json':
            if (typeof value === 'string') {
                try { return JSON.parse(value); } catch { return value; }
            }
            return value;
        case 'enumeration':
            return String(value).trim();
        default:
            return value;
    }
}

// `publish` is a per-row directive (not a domain field) controlled by the
// spreadsheet's optional Publish column:
//   true  → upsert as draft, then publish it
//   false → upsert as draft, leave as draft
//   undefined / empty → no publish/unpublish action; just upsert the draft
function splitItem(strapi, uid, item) {
    const entity = {};
    const seo = {};
    let publish;
    for (const [k, v] of Object.entries(item || {})) {
        if (k === 'documentId') continue;
        if (k === 'contentType') continue; // guard-only marker, never an entity field
        if (k === 'publish') {
            publish = parseBool(v);
            continue;
        }
        if (READ_ONLY_FIELDS.has(k)) continue;
        if (SEO_FIELDS.has(k)) {
            if (v !== undefined && v !== null && v !== '') seo[k] = v;
        } else if (v !== undefined && v !== '') {
            entity[k] = coerceForSchema(strapi, uid, k, v);
        }
    }
    return { entity, seo, publish };
}

// status:'draft' is only valid on CTs that have draftAndPublish enabled.
// Read the flag off the live schema so we can pick a single source of truth
// and not hardcode per-CT special cases. delivery-method is the only entry
// in our allowlist without D&P at the time of writing.
function supportsDraftAndPublish(strapi, uid) {
    return !!strapi.contentTypes?.[uid]?.options?.draftAndPublish;
}

function withDraftStatus(strapi, uid, params) {
    return supportsDraftAndPublish(strapi, uid) ? { ...params, status: 'draft' } : params;
}

async function findExistingByDocumentId(strapi, uid, documentId) {
    if (!documentId) return null;
    try {
        const res = await strapi.documents(uid).findOne(withDraftStatus(strapi, uid, {
            documentId,
            fields: ['documentId'],
        }));
        return res || null;
    } catch {
        return null;
    }
}

async function findExistingByNaturalKey(strapi, uid, naturalKey, value) {
    if (!naturalKey || !value) return null;
    try {
        const rows = await strapi.documents(uid).findMany(withDraftStatus(strapi, uid, {
            filters: { [naturalKey]: { $eq: value } },
            fields: ['documentId'],
            pagination: { pageSize: 1 },
        }));
        return rows?.[0] || null;
    } catch {
        return null;
    }
}

async function findExistingSeoMeta(strapi, relation, entityDocumentId) {
    if (!relation || !entityDocumentId) return null;
    try {
        const rows = await strapi.documents('api::seo-meta.seo-meta').findMany({
            filters: { [relation]: { documentId: { $eq: entityDocumentId } } },
            fields: ['documentId'],
            pagination: { pageSize: 1 },
        });
        return rows?.[0] || null;
    } catch {
        return null;
    }
}

async function upsertSeoMeta(strapi, cfg, entityDocumentId, seoData) {
    if (!cfg.relation || !seoData || Object.keys(seoData).length === 0) return;
    const existing = await findExistingSeoMeta(strapi, cfg.relation, entityDocumentId);
    if (existing?.documentId) {
        await strapi.documents('api::seo-meta.seo-meta').update({
            documentId: existing.documentId,
            data: seoData,
        });
    } else {
        await strapi.documents('api::seo-meta.seo-meta').create({
            data: {
                ...seoData,
                entity_type: cfg.entityType,
                [cfg.relation]: entityDocumentId,
            },
        });
    }
}

function rowLabel(item, naturalKey) {
    return (
        (naturalKey && item?.[naturalKey]) ||
        item?.title ||
        item?.name ||
        item?.slug ||
        item?.sku ||
        item?.documentId ||
        '(unknown)'
    );
}

module.exports = {
    async import(ctx) {
        if (!(await ensureUser(ctx, strapi))) return;

        // Admin-only. The active role is published by the CMS app via the
        // x-rutba-app-role header (see RoleSwitcher / pos-shared); accept any
        // role key that ends in `_admin`, matching isActiveAdminRole().
        const activeRole = String(ctx.request.headers['x-rutba-app-role'] || '').trim();
        if (!/(?:^|_)admin$/.test(activeRole)) {
            return ctx.forbidden('Admin role required for bulk import');
        }

        // Generated client posts via `wrapData()` which sends
        // `{ data: { contentType, items } }`; tolerate both wrapped and
        // flat bodies so curl / manual fetches still work.
        const body = ctx.request.body || {};
        const { contentType, items } = body.data && typeof body.data === 'object' ? body.data : body;
        if (!contentType || typeof contentType !== 'string') {
            return ctx.badRequest('contentType is required');
        }
        const cfg = CONTENT_TYPES[contentType];
        if (!cfg) {
            return ctx.badRequest(`contentType "${contentType}" is not in the bulk-import allowlist`);
        }
        if (!Array.isArray(items)) {
            return ctx.badRequest('items must be an array');
        }
        if (items.length === 0) {
            return ctx.send({ ok: true, total: 0, created: 0, updated: 0, failed: [] });
        }
        if (items.length > MAX_ROWS_PER_REQUEST) {
            return ctx.badRequest(
                `chunk too large: ${items.length} rows (max ${MAX_ROWS_PER_REQUEST}). Split into smaller chunks.`,
            );
        }

        let created = 0;
        let updated = 0;
        let published = 0;
        const failed = [];
        // Two-phase publish: gather everything that asked to be published
        // and process it AFTER all upserts in the chunk complete. Strapi 5
        // refuses to publish a draft whose relations target unpublished
        // siblings; doing the publish pass last (with retries) lets two rows
        // in the same chunk that reference each other resolve correctly.
        const pendingPublish = []; // { documentId, index, label }

        for (let index = 0; index < items.length; index++) {
            const item = items[index] || {};
            const label = rowLabel(item, cfg.naturalKey);
            try {
                const { entity, seo, publish } = splitItem(strapi, contentType, item);
                const rawDocId = item.documentId ? String(item.documentId).trim() : '';
                let existing = rawDocId
                    ? await findExistingByDocumentId(strapi, contentType, rawDocId)
                    : null;
                if (!existing && cfg.naturalKey) {
                    existing = await findExistingByNaturalKey(
                        strapi,
                        contentType,
                        cfg.naturalKey,
                        entity[cfg.naturalKey],
                    );
                }

                let documentId;
                if (existing?.documentId) {
                    if (Object.keys(entity).length > 0) {
                        await strapi.documents(contentType).update(withDraftStatus(strapi, contentType, {
                            documentId: existing.documentId,
                            data: entity,
                        }));
                    }
                    documentId = existing.documentId;
                    updated += 1;
                } else {
                    const newDoc = await strapi.documents(contentType).create(withDraftStatus(strapi, contentType, {
                        data: entity,
                    }));
                    documentId = newDoc?.documentId;
                    created += 1;
                }

                if (documentId && cfg.relation) {
                    await upsertSeoMeta(strapi, cfg, documentId, seo);
                }

                // Defer the publish step. delivery-method (no D&P) is
                // skipped entirely — there's no draft/published split.
                if (
                    documentId
                    && publish === true
                    && supportsDraftAndPublish(strapi, contentType)
                ) {
                    pendingPublish.push({ documentId, index, label });
                }
            } catch (err) {
                failed.push({
                    index,
                    label,
                    message: err?.message || String(err),
                });
            }
        }

        // Publish pass with retries. Strapi 5 rejects a publish whose
        // relations target unpublished entries — when two rows in the same
        // chunk reference each other, the first attempt fails but the second
        // succeeds because the prior round just published its dependency.
        // We retry only that specific failure class so genuine errors still
        // surface quickly.
        let queue = pendingPublish;
        const MAX_ROUNDS = 4;
        let round = 0;
        while (queue.length > 0 && round < MAX_ROUNDS) {
            const stillPending = [];
            for (const entry of queue) {
                try {
                    await strapi.documents(contentType).publish({ documentId: entry.documentId });
                    published += 1;
                } catch (err) {
                    const msg = err?.message || String(err);
                    if (/relation\(s\).*do not exist/i.test(msg) && round < MAX_ROUNDS - 1) {
                        stillPending.push(entry);
                    } else {
                        failed.push({
                            index: entry.index,
                            label: entry.label,
                            message: `publish failed: ${msg}`,
                        });
                    }
                }
            }
            // No progress in this round — every retry hit the same wall.
            // Surface them as failures instead of looping forever.
            if (stillPending.length === queue.length) {
                for (const entry of stillPending) {
                    failed.push({
                        index: entry.index,
                        label: entry.label,
                        message: 'publish failed: related entities are still drafts (publish them first or import in two passes)',
                    });
                }
                break;
            }
            queue = stillPending;
            round += 1;
        }

        return ctx.send({
            ok: true,
            total: items.length,
            created,
            updated,
            published,
            failed,
        });
    },
};
