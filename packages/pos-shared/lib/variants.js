// Variant-creation helpers shared across pos-stock + rutba-cms.
//
// Today four surfaces create variant products with subtly different code
// paths (product-variants.js term flow, catalogue-import.js PDF flow,
// ProductGalleryManager image flow, ProductGalleryManager term flow).
// They duplicate the name composer, payload shape, and "inherit from
// parent" logic. This module consolidates them so each surface contributes
// only its UI; the network calls + side-effects live here.

import {
    saveProduct,
    StockHelpersEndpoints,
    StockItemsEndpoints,
    ProductsEndpoints,
    UploadEndpoints,
} from "@rutba/api-provider/endpoints";

/**
 * Compose a variant's display name from a base + discriminator.
 *
 *   buildVariantName("Red T-Shirt", "Small")            → "Red T-Shirt - Small"
 *   buildVariantName("Red T-Shirt", "Small", "prefix")  → "Small - Red T-Shirt"
 *
 * If either side is empty, returns whichever is set (so "" doesn't produce
 * orphaned separators).
 */
export function buildVariantName(baseName, discriminator, namingMode = "suffix") {
    const base = (baseName || "").trim();
    const disc = (discriminator || "").trim();
    if (!base) return disc;
    if (!disc) return base;
    return namingMode === "prefix" ? `${disc} - ${base}` : `${base} - ${disc}`;
}

/**
 * Build the create-time payload for a new variant product.
 *
 * Required: parent (documentId of the parent product), name.
 * Optional inputs are written through when defined — empty strings for
 * sku/barcode are treated as "not provided" so the parent's value isn't
 * accidentally overwritten with "".
 *
 * Pass `term` to connect the variant to a single term (categorisation /
 * variant-axis tag). Pass `gallery` (array of numeric file ids) and `logo`
 * (numeric file id) for the gallery-image flow.
 */
export function buildVariantPayload({ parent, name, sku, barcode, selling_price, offer_price, is_active = true, term, gallery, logo }) {
    if (!parent) throw new Error("buildVariantPayload requires parent (documentId)");
    if (!name) throw new Error("buildVariantPayload requires name");
    const payload = {
        parent,
        is_variant: true,
        is_active,
        name,
    };
    if (sku !== undefined && sku !== "") payload.sku = sku;
    if (barcode !== undefined && barcode !== "") payload.barcode = barcode;
    if (selling_price !== undefined && selling_price !== "") payload.selling_price = selling_price;
    if (offer_price !== undefined && offer_price !== "") payload.offer_price = offer_price;
    if (term) Object.assign(payload, StockHelpersEndpoints.relationConnects({ terms: [term] }));
    if (gallery && gallery.length) payload.gallery = gallery;
    if (logo) payload.logo = logo;
    return payload;
}

/**
 * Canonical entry point for creating a variant. Returns:
 *   { documentId, id, name, raw }
 *
 * Modes:
 *
 *   'term'          — from a term-type selection (e.g. colour = Red).
 *                     config: { baseName, term, namingMode, sku?, barcode?,
 *                       selling_price?, offer_price?, is_active?,
 *                       moveStockItemDocIds?: string[] }
 *
 *   'term-gallery'  — same as 'term' but never moves stock items. Used by
 *                     ProductGalleryManager where stock-item migration is
 *                     out of scope.
 *
 *   'pdf-page'      — from a PDF page extract. After create, uploads the
 *                     supplied PNG/File as the variant's logo.
 *                     config: { baseName, pageName, namingMode, sku?,
 *                       barcode?, selling_price?, offer_price?, is_active?,
 *                       term?, pdfPageFile: File, logoCaption? }
 *
 *   'gallery-image' — from one or more images currently in the parent's
 *                     gallery. After create, removes those images from the
 *                     parent (caller passes the post-removal id list to
 *                     avoid an extra round-trip).
 *                     config: { variantName, imageIds: number[],
 *                       parentRemainingGalleryIds: number[], sku?, barcode?,
 *                       selling_price?, offer_price?, is_active? }
 */
export async function createVariant(parentDocumentId, mode, config) {
    if (!parentDocumentId) throw new Error("createVariant requires parentDocumentId");
    if (!config || typeof config !== "object") throw new Error("createVariant requires config");
    switch (mode) {
        case "term":
        case "term-gallery":
            return _createTermVariant(parentDocumentId, config, mode === "term");
        case "pdf-page":
            return _createPdfPageVariant(parentDocumentId, config);
        case "gallery-image":
            return _createGalleryImageVariant(parentDocumentId, config);
        default:
            throw new Error(`createVariant: unknown mode '${mode}'`);
    }
}

// ---- internals ----

// saveProduct returns the API envelope shape; downstream code historically
// peels off `response?.data?.data ?? response?.data ?? response` to handle
// every shape it has ever produced. Centralised here.
async function _saveAndUnwrap(payload) {
    const response = await saveProduct("new", payload);
    const created = response?.data?.data ?? response?.data ?? response;
    return {
        documentId: created?.documentId,
        id: created?.id,
        name: created?.name,
        raw: created,
    };
}

async function _createTermVariant(parentDocumentId, config, allowStockMove) {
    if (!config.term) throw new Error("term mode requires config.term");
    const name = buildVariantName(config.baseName, config.term.name, config.namingMode);
    const payload = buildVariantPayload({
        parent: parentDocumentId,
        name,
        sku: config.sku,
        barcode: config.barcode,
        selling_price: config.selling_price,
        offer_price: config.offer_price,
        is_active: config.is_active,
        term: config.term,
    });
    const created = await _saveAndUnwrap(payload);
    if (allowStockMove && Array.isArray(config.moveStockItemDocIds) && config.moveStockItemDocIds.length && created.documentId) {
        // Sequential to keep the audit trail readable and to avoid hammering
        // the API with N concurrent writes when N is large.
        for (const itemDocId of config.moveStockItemDocIds) {
            await StockItemsEndpoints.update(itemDocId, {
                product: { set: [created.documentId] },
                name: created.name || name,
            });
        }
    }
    return created;
}

async function _createPdfPageVariant(parentDocumentId, config) {
    const name = buildVariantName(config.baseName, config.pageName, config.namingMode);
    const payload = buildVariantPayload({
        parent: parentDocumentId,
        name,
        sku: config.sku,
        barcode: config.barcode,
        selling_price: config.selling_price,
        offer_price: config.offer_price,
        is_active: config.is_active,
        term: config.term,
    });
    const created = await _saveAndUnwrap(payload);
    // The Strapi upload endpoint wants the numeric id, not the documentId.
    if (created.id && config.pdfPageFile) {
        try {
            await UploadEndpoints.uploadFiles(
                [config.pdfPageFile],
                "product",
                "logo",
                created.id,
                { name, alt: name, caption: config.logoCaption || "" },
            );
        } catch (err) {
            // Logo upload is best-effort — the variant still exists.
            console.warn("PDF logo upload failed (variant kept)", err);
        }
    }
    return created;
}

async function _createGalleryImageVariant(parentDocumentId, config) {
    if (!Array.isArray(config.imageIds) || config.imageIds.length === 0) {
        throw new Error("gallery-image mode requires config.imageIds");
    }
    if (!config.variantName) throw new Error("gallery-image mode requires config.variantName");
    const payload = buildVariantPayload({
        parent: parentDocumentId,
        name: config.variantName,
        sku: config.sku,
        barcode: config.barcode,
        selling_price: config.selling_price,
        offer_price: config.offer_price,
        is_active: config.is_active,
        gallery: config.imageIds,
        logo: config.imageIds[0],
    });
    const created = await _saveAndUnwrap(payload);
    if (Array.isArray(config.parentRemainingGalleryIds)) {
        await ProductsEndpoints.update(parentDocumentId, {
            gallery: config.parentRemainingGalleryIds,
        });
    }
    return created;
}
