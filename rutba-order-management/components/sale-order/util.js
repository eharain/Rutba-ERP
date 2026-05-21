import { MediaUtilsEndpoints } from "@rutba/api-provider/endpoints/index.js";

// Resolve a Strapi media object to a thumbnail URL. Prefers the `thumbnail`
// format because the table cell is 48px — pulling the original would waste
// bandwidth across rows.
export function resolveItemThumb(imageMedia) {
  if (!imageMedia) return null;
  const chosen =
    imageMedia.formats?.thumbnail ||
    imageMedia.formats?.small ||
    imageMedia;
  const url = chosen?.url || imageMedia.url;
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return MediaUtilsEndpoints.imageBaseUrl() + url;
}

// Convert a populated order line into the shape the items table expects.
// Used by both the editable Draft items grid and the read-only summary
// rendered by Preparation/Settled stages.
export function lineFromItem(item) {
  return {
    productDocumentId: item.product?.documentId || item.product || "",
    productName: item.product_name || "",
    quantity: String(item.quantity ?? 1),
    price: String(item.price ?? 0),
    variant: item.variant || "",
    variantName: item.variant_name || "",
    variantTerms: item.variant_terms || null,
    imageId: item.image?.id ?? (typeof item.image === "number" ? item.image : null),
    imageMedia: item.image && typeof item.image === "object" ? item.image : null,
    stockItemDocumentId: item.stock_item?.documentId || "",
    stockItemInfo: item.stock_item
      ? {
          sku: item.stock_item.sku || "",
          barcode: item.stock_item.barcode || "",
          name: item.stock_item.name || "",
          status: item.stock_item.status || "",
        }
      : null,
  };
}

// True when this order is being paid on delivery (cash handed to rider /
// remitted by courier). COD changes the rest of the flow in two ways:
//   1. The "Awaiting Verification" stage cannot really verify anything —
//      no cash has been collected yet, the order needs to ship first.
//      So we ungate PREPARING and surface a "deferred verification" banner.
//   2. After DELIVERED, SettledStage shows a "record + verify cash" card
//      so accounts can reconcile the rider/courier remittance.
// Anything non-COD is treated as upfront-paid (card, transfer, gateway):
// verification happens before preparation as it does today.
export function isCOD(order) {
  return String(order?.payment_method || "").toLowerCase() === "cod";
}

export const EMPTY_LINE = {
  productDocumentId: "",
  productName: "",
  quantity: "1",
  price: "0",
  variant: "",
  variantName: "",
  variantTerms: null,
  imageId: null,
  imageMedia: null,
  stockItemDocumentId: "",
  stockItemInfo: null,
};
