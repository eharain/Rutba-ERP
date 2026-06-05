import FileView from "@rutba/pos-shared/components/FileView";
import { SeoMetasEndpoints } from "@rutba/api-provider/endpoints";

/**
 * SeoMetaFields — reusable SEO & Social form block.
 *
 * Used in two places:
 *   • Inline inside an entity edit screen (collapsible card)
 *   • Standalone on /[documentId]/seo-meta
 *
 * Fully controlled — caller owns the value object and handles persistence via
 * SeoMetasEndpoints.
 *
 * Props:
 *   value      — { meta_title, meta_description, noindex, og_image, keywords }
 *                where keywords is a comma-separated string.
 *   onChange   — (patch) => void, called with a partial value object.
 *   parentTitle— string, used in the Meta Title placeholder.
 *   refId / refDocumentId — seo-meta id + documentId, drives og_image upload.
 *   readOnlyOgImage — disables the FileView when the seo-meta hasn't been
 *                     created yet (no ref to attach the upload to).
 */
export default function SeoMetaFields({
    value,
    onChange,
    parentTitle = "",
    refId = null,
    refDocumentId = null,
    readOnlyOgImage = false,
}) {
    const v = value || {};
    const metaTitle = v.meta_title || "";
    const metaDescription = v.meta_description || "";
    const noindex = !!v.noindex;
    const keywords = typeof v.keywords === "string" ? v.keywords : "";

    const set = (patch) => onChange?.(patch);

    return (
        <>
            <div className="mb-3">
                <label className="form-label">
                    Meta Title <span className="text-muted small">(optional)</span>
                </label>
                <input
                    type="text"
                    className="form-control"
                    value={metaTitle}
                    onChange={(e) => set({ meta_title: e.target.value })}
                    placeholder={parentTitle ? `Falls back to "${parentTitle}"` : "Falls back to entity title"}
                    maxLength={70}
                />
                <small className="text-muted">
                    {metaTitle.length}/70 — keep under 60 for best display in Google.
                </small>
            </div>

            <div className="mb-3">
                <label className="form-label">
                    Meta Description <span className="text-muted small">(optional)</span>
                </label>
                <textarea
                    className="form-control"
                    rows={3}
                    value={metaDescription}
                    onChange={(e) => set({ meta_description: e.target.value })}
                    placeholder="Falls back to excerpt → site description"
                    maxLength={200}
                />
                <small className="text-muted">
                    {metaDescription.length}/200 — Google typically shows ~155.
                </small>
            </div>

            <div className="mb-3">
                <label className="form-label">
                    Keywords <span className="text-muted small">(comma-separated)</span>
                </label>
                <textarea
                    className="form-control"
                    rows={2}
                    value={keywords}
                    onChange={(e) => set({ keywords: e.target.value })}
                    placeholder="e.g. summer collection, linen shirts, breathable"
                />
                <small className="text-muted">
                    Free-form list, comma-separated. Merged with site-wide default keywords (deduped).
                </small>
            </div>

            <div className="mb-3">
                <label className="form-label">Social Share Image (OG)</label>
                {readOnlyOgImage || !refDocumentId ? (
                    <div className="text-muted small fst-italic">
                        Save the SEO meta record first to upload an OG image.
                    </div>
                ) : (
                    <FileView
                        single={v.og_image}
                        refName="seo-meta"
                        refId={refId}
                        refDocumentId={refDocumentId}
                        field="og_image"
                        name={metaTitle || parentTitle}
                        onFileChange={(_field, file) => set({ og_image: file || null })}
                    />
                )}
                <small className="text-muted d-block mt-1">
                    Falls back to featured image → site default OG image. Recommended 1200×630.
                </small>
            </div>

            <div className="form-check">
                <input
                    type="checkbox"
                    className="form-check-input"
                    id="seo-noindex"
                    checked={noindex}
                    onChange={(e) => set({ noindex: e.target.checked })}
                />
                <label className="form-check-label" htmlFor="seo-noindex">
                    Hide from search engines (noindex)
                </label>
                <div className="form-text">
                    Page will be excluded from sitemap and tagged <code>noindex,nofollow</code>.
                </div>
            </div>
        </>
    );
}

// Map entity-type slug → relation field name on seo-meta. Mirrors the Strapi
// schema; keep in sync with pos-strapi/src/utils/seo-meta-helper.js.
export const ENTITY_TYPE_TO_RELATION = {
    "cms-page": "cms_page",
    "product": "product",
    "category": "category",
    "brand": "brand",
    "product-group": "product_group",
    "brand-group": "brand_group",
    "category-group": "category_group",
    "cms-page-group": "cms_page_group",
};

/**
 * normaliseSeoMetaSavePayload — strip the value into Strapi update shape.
 *
 * Pass entityType + entityDocumentId to (re)attach the seo-meta to its parent
 * entity. Either field can be omitted when only updating an existing record.
 */
export function normaliseSeoMetaSavePayload(value, { entityType, entityDocumentId } = {}) {
    if (!value) return null;
    const payload = {
        meta_title: value.meta_title || null,
        meta_description: value.meta_description || null,
        noindex: !!value.noindex,
        keywords: typeof value.keywords === "string" ? value.keywords : null,
    };
    if (value.og_image?.id) payload.og_image = value.og_image.id;
    else if (value.og_image === null) payload.og_image = null;
    if (entityType && entityDocumentId) {
        const relation = ENTITY_TYPE_TO_RELATION[entityType];
        if (relation) {
            payload.entity_type = entityType;
            payload[relation] = entityDocumentId;
        }
    }
    return payload;
}

/**
 * persistSeoMeta — common save-side flow used by every entity edit page.
 * Updates the seo-meta record if one exists, otherwise creates and links it.
 * Caller passes setSeoMeta so the in-form state gets the server's response
 * (with documentId on first create, so og_image upload becomes available).
 *
 * Returns the persisted record, or null if there was nothing to save.
 */
export async function persistSeoMeta({ seoMeta, setSeoMeta, entityType, entityDocumentId, onError }) {
    if (!seoMeta) return null;
    const payload = normaliseSeoMetaSavePayload(seoMeta, { entityType, entityDocumentId });
    if (!payload) return null;
    try {
        const res = seoMeta.documentId
            ? await SeoMetasEndpoints.update(seoMeta.documentId, payload)
            : await SeoMetasEndpoints.create(payload);
        const next = res.data || res;
        if (setSeoMeta) setSeoMeta(next);
        return next;
    } catch (err) {
        console.error("Failed to save SEO meta", err);
        if (onError) onError(err);
        return null;
    }
}
