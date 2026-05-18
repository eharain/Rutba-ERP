import { SeoMetasEndpoints } from "@rutba/api-provider/endpoints";

// SEO columns are surfaced from the linked `seo_meta` (api::seo-meta) record.
// We export the text-only fields; og_image (media) is intentionally excluded
// per the "text only" export rule.
//
// Usage:
//   columns: [..., ...SEO_EXCEL_COLUMNS],
//   onSecondary: makeSeoUpsert('product'),  // entity relation key on seo_meta
//
// The relation key follows the seo-meta schema:
//   cms-page       → cms_page
//   product        → product
//   category       → category
//   brand          → brand
//   product-group  → product_group
//   brand-group    → brand_group
//   category-group → category_group

export const SEO_EXCEL_COLUMNS = [
    {
        key: "meta_title",
        target: "seo",
        width: 60,
        format: (r) => r?.seo_meta?.meta_title || "",
    },
    {
        key: "meta_description",
        target: "seo",
        width: 90,
        format: (r) => r?.seo_meta?.meta_description || "",
    },
    {
        key: "keywords",
        target: "seo",
        width: 60,
        format: (r) => r?.seo_meta?.keywords || "",
    },
    {
        key: "noindex",
        target: "seo",
        width: 10,
        format: (r) => (r?.seo_meta?.noindex ? "true" : "false"),
        parse: (v) => /^(true|1|yes|y)$/i.test(String(v).trim()),
    },
];

// Returns an onSecondary handler that upserts the seo_meta record for one
// row of the given entity type. `entityRelKey` is the seo-meta relation key
// pointing back to this entity (see header table above).
//
// `entityType` is the seo-meta `entity_type` enum value, denormalised for
// listing/export filters on the SEO admin screen.
export function makeSeoUpsert(entityRelKey, entityType) {
    return async ({ documentId, buckets, existing }) => {
        const seoData = buckets?.seo;
        if (!seoData || Object.keys(seoData).length === 0) return;

        const existingSeoMeta =
            existing?.seo_meta?.documentId
                ? existing.seo_meta
                : await findSeoMetaForEntity(entityRelKey, documentId);

        if (existingSeoMeta?.documentId) {
            await SeoMetasEndpoints.update(existingSeoMeta.documentId, seoData);
        } else {
            await SeoMetasEndpoints.create({
                ...seoData,
                entity_type: entityType,
                [entityRelKey]: documentId,
            });
        }
    };
}

async function findSeoMetaForEntity(entityRelKey, documentId) {
    // Override the descriptor's default populate (which fans out across every
    // entity relation and was hitting a 400 "Invalid key slug" against
    // /api/seo-metas — the heavy populate isn't needed for an existence check
    // anyway). We just want this seo-meta's documentId.
    try {
        const res = await SeoMetasEndpoints.list({
            pageSize: 1,
            filters: { [entityRelKey]: { documentId: { $eq: documentId } } },
            populate: [],
            sort: [],
            fields: ["documentId"],
        });
        return res.data?.[0] || null;
    } catch {
        return null;
    }
}

// Populate fragment for listDraft calls so the SEO columns can render.
export const SEO_POPULATE = { seo_meta: { fields: ["meta_title", "meta_description", "keywords", "noindex"] } };
