'use strict';

const { errors } = require('@strapi/utils');
const { ensureSeoMetaForEntity } = require('../../../../utils/seo-meta-helper');

const PRODUCT_UID = 'api::product.product';

// Normalise however a relation arrives on a write payload → { id } | { documentId } | null.
function relTarget(v) {
    if (v == null) return null;
    if (typeof v === 'number') return { id: v };
    if (typeof v === 'string') return { documentId: v };
    if (Array.isArray(v)) return v.length ? relTarget(v[0]) : null;
    if (typeof v === 'object') {
        if (v.id != null) return { id: v.id };
        if (v.documentId != null) return { documentId: v.documentId };
        if (v.connect != null) return relTarget(v.connect);
        if (v.set != null) return relTarget(v.set);
    }
    return null; // disconnect / empty → clearing the parent
}

// Guard the product variant hierarchy on any write that sets `parent`:
//   - a product can't be its own parent,
//   - a product that already has variants can't itself become a variant
//     (the UI + byParent queries only handle one level),
//   - the new parent can't be a descendant of this product (cycle).
async function validateParentChange(strapi, where, parentPayload) {
    const target = relTarget(parentPayload);
    if (!target) return; // clearing / detaching parent is always safe

    const current = await strapi.db.query(PRODUCT_UID).findOne({
        where, select: ['id', 'documentId'], populate: { variants: { select: ['id'] } },
    });
    if (!current?.id) return;
    const productId = current.id;

    const parentWhere = target.id != null ? { id: target.id } : { documentId: target.documentId };
    let cursor = await strapi.db.query(PRODUCT_UID).findOne({
        where: parentWhere, select: ['id'], populate: { parent: { select: ['id'] } },
    });
    if (!cursor?.id) return; // unknown parent — leave to normal relation validation
    const newParentId = cursor.id;

    if (newParentId === productId) {
        throw new errors.ApplicationError('A product cannot be its own variant parent.');
    }
    const childCount = Array.isArray(current.variants) ? current.variants.length : 0;
    if (childCount > 0) {
        throw new errors.ApplicationError(
            `Cannot make this product a variant: it already has ${childCount} variant(s). Detach or move them first.`,
        );
    }

    // Walk the prospective parent's ancestor chain — if this product appears, the
    // change would form a cycle.
    const seen = new Set([newParentId]);
    let depth = 0;
    while (cursor && depth < 100) {
        const pid = cursor.parent?.id;
        if (!pid) break;
        if (pid === productId) {
            throw new errors.ApplicationError(
                'This change would create a variant cycle (the chosen parent is a descendant of this product).',
            );
        }
        if (seen.has(pid)) break; // pre-existing loop — don't spin
        seen.add(pid);
        cursor = await strapi.db.query(PRODUCT_UID).findOne({
            where: { id: pid }, select: ['id'], populate: { parent: { select: ['id'] } },
        });
        depth += 1;
    }
}

function slugify(input) {
    return String(input || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

// Strapi's uid type auto-generates the slug only from the admin UI's
// "regenerate" affordance — direct API writes leave slug null. We mirror that
// generation here so every product ends up with a usable slug, and we suffix
// a short id-derived tail when the base collides with another row.
async function ensureUniqueSlug(strapi, base, excludeId) {
    const safeBase = base || 'product';
    let candidate = safeBase;
    let attempt = 0;
    while (true) {
        const filters = { slug: { $eq: candidate } };
        if (excludeId) filters.id = { $ne: excludeId };
        const existing = await strapi.db.query('api::product.product').findOne({
            where: filters,
            select: ['id'],
        });
        if (!existing) return candidate;
        attempt += 1;
        candidate = `${safeBase}-${attempt + 1}`;
        if (attempt > 50) return `${safeBase}-${Date.now().toString(36)}`;
    }
}

module.exports = {
    async beforeCreate(event) {
        const data = event.params?.data;
        if (!data) return;
        const desired = (typeof data.slug === 'string' && data.slug.trim())
            ? slugify(data.slug)
            : slugify(data.name);
        if (desired) {
            data.slug = await ensureUniqueSlug(strapi, desired);
        }
    },

    async beforeUpdate(event) {
        const data = event.params?.data;
        if (!data) return;

        // Variant hierarchy integrity — runs whenever `parent` is set.
        if (Object.prototype.hasOwnProperty.call(data, 'parent')) {
            await validateParentChange(strapi, event.params?.where || {}, data.parent);
        }

        // Only act when the caller explicitly touches slug or name. Leaving
        // slug alone on unrelated edits keeps URLs stable.
        const touchedSlug = Object.prototype.hasOwnProperty.call(data, 'slug');
        const touchedName = Object.prototype.hasOwnProperty.call(data, 'name');
        if (!touchedSlug && !touchedName) return;

        const where = event.params?.where || {};
        const current = await strapi.db.query('api::product.product').findOne({
            where,
            select: ['id', 'slug', 'name'],
        });
        const excludeId = current?.id;

        let desired;
        if (touchedSlug && typeof data.slug === 'string' && data.slug.trim()) {
            desired = slugify(data.slug);
        } else if (touchedSlug && !data.slug && (data.name || current?.name)) {
            // Caller cleared slug — regenerate from name.
            desired = slugify(data.name || current.name);
        } else if (!touchedSlug && touchedName && !current?.slug) {
            // Name changed on a row that never had a slug — fill it in.
            desired = slugify(data.name);
        }
        if (desired) {
            data.slug = await ensureUniqueSlug(strapi, desired, excludeId);
        }
    },

    async afterCreate(event) {
        try {
            const { result } = event;
            if (!result?.documentId) return;
            await ensureSeoMetaForEntity(strapi, {
                entityType: 'product',
                documentId: result.documentId,
                title: result.name,
            });
        } catch (err) {
            strapi.log.warn(`[product.afterCreate] seo-meta auto-create failed: ${err.message}`);
        }
    },
};
