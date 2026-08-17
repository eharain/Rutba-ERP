'use strict';

/**
 * Helpers shared by the seo-meta controller, lifecycles, and bootstrap backfill.
 * Single source of truth for: which entity types are supported, the relation
 * field name on seo-meta for each, and the title-derivation rule.
 */

const ENTITY_TYPES = [
    { type: 'cms-page',       uid: 'api::cms-page.cms-page',           relation: 'cms_page',       titleField: 'title' },
    { type: 'product',        uid: 'api::product.product',             relation: 'product',        titleField: 'name'  },
    { type: 'category',       uid: 'api::category.category',           relation: 'category',       titleField: 'name'  },
    { type: 'brand',          uid: 'api::brand.brand',                 relation: 'brand',          titleField: 'name'  },
    { type: 'product-group',  uid: 'api::product-group.product-group', relation: 'product_group',  titleField: 'name'  },
    { type: 'brand-group',    uid: 'api::brand-group.brand-group',     relation: 'brand_group',    titleField: 'name'  },
    { type: 'category-group', uid: 'api::category-group.category-group', relation: 'category_group', titleField: 'name'  },
    { type: 'cms-page-group', uid: 'api::cms-page-group.cms-page-group', relation: 'cms_page_group', titleField: 'name'  },
];

const BY_TYPE = new Map(ENTITY_TYPES.map((e) => [e.type, e]));
const BY_UID = new Map(ENTITY_TYPES.map((e) => [e.uid, e]));

function relationFor(entityType) {
    return BY_TYPE.get(entityType)?.relation || null;
}

function configForUid(uid) {
    return BY_UID.get(uid) || null;
}

function allConfigs() {
    return ENTITY_TYPES;
}

/**
 * Markdown-aware excerpt cleaner. Used to seed meta_description from richtext
 * fields (excerpt / summary / description) on backfill.
 */
function deriveDescription(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const stripped = raw
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[#>*_~\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!stripped) return null;
    return stripped.length > 155 ? stripped.slice(0, 152) + '…' : stripped;
}

/**
 * Ensure-seo-meta — used by lifecycles. Creates the sidecar if none exists.
 * Idempotent.
 */
async function ensureSeoMetaForEntity(strapi, { entityType, documentId, title, description = null }) {
    const cfg = BY_TYPE.get(entityType);
    if (!cfg || !documentId) return null;

    const existing = await strapi.documents('api::seo-meta.seo-meta').findMany({
        filters: { [cfg.relation]: { documentId: { $eq: documentId } } },
        fields: ['documentId'],
        pagination: { pageSize: 1 },
    });
    if (existing?.[0]?.documentId) return existing[0];

    return strapi.documents('api::seo-meta.seo-meta').create({
        data: {
            entity_type: entityType,
            entity_title: title || null,
            meta_description: description || null,
            [cfg.relation]: documentId,
            noindex: false,
        },
    });
}

module.exports = {
    ENTITY_TYPES,
    relationFor,
    configForUid,
    allConfigs,
    deriveDescription,
    ensureSeoMetaForEntity,
};
