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
    // Discount audit trail — server-stamped on save, echoed back here so the
    // line editor reopens showing which offer (or manual reason) produced the
    // price rather than silently resetting to list.
    originalPrice: item.original_price != null ? String(item.original_price) : "",
    discountSource: item.discount_source || "none",
    saleOfferDocumentId: item.sale_offer?.documentId || item.sale_offer || "",
    offerName: item.offer_name || "",
    discountReason: item.discount_reason || "",
  };
}

// Serialise an editor line back into the wire shape POST /update-items and
// the create handler expect. Only the discount fields relevant to the chosen
// source are sent — the server ignores the rest, but sending a stale
// sale_offer alongside discount_source:'manual' reads as a contradiction.
export function itemFromLine(line) {
  const q = Number(line.quantity || 0);
  const p = Number(line.price || 0);
  const out = {
    product: line.productDocumentId,
    product_name: (line.productName || "").trim(),
    quantity: q,
    price: p,
    total: q * p,
    discount_source: line.discountSource || "none",
  };
  if (line.variant) out.variant = line.variant;
  if (line.variantName) out.variant_name = line.variantName;
  if (line.variantTerms) out.variant_terms = line.variantTerms;
  if (line.imageId) out.image = line.imageId;
  if (line.stockItemDocumentId) out.stock_item = { documentId: line.stockItemDocumentId };
  if (out.discount_source === "offer" && line.saleOfferDocumentId) {
    out.sale_offer = line.saleOfferDocumentId;
  }
  if (out.discount_source === "manual") {
    out.discount_reason = (line.discountReason || "").trim();
  }
  return out;
}

// Human label for a line's discount, for the read-only stages.
export function discountLabel(line) {
  switch (line.discountSource) {
    case "offer":
      return line.offerName ? `Offer: ${line.offerName}` : "Offer";
    case "product_offer_price":
      return "Product offer price";
    case "manual":
      return line.discountReason ? `Manual: ${line.discountReason}` : "Manual discount";
    default:
      return "";
  }
}

// True when the line is actually below its list price. A line can carry
// discount_source 'offer' and still sit at list (e.g. a free-shipping-only
// offer), which shouldn't render as a price reduction.
export function isDiscounted(line) {
  const orig = Number(line.originalPrice || 0);
  const price = Number(line.price || 0);
  return orig > 0 && price > 0 && price + 0.001 < orig;
}

// Unwrap an axios / api-provider error to the server's actual message.
// Strapi returns `{ error: { message, status, … } }` on 4xx, and the
// generated client rejects with an AxiosError whose `.message` is the
// useless "Request failed with status code 400". Reach into response.data
// for the real reason so toasts and console logs are diagnostic.
export function serverMessage(err, fallback = "unknown error") {
  const fromStrapi = err?.response?.data?.error?.message;
  if (fromStrapi) return fromStrapi;
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.message && err.message !== "Request failed with status code 400") {
    return err.message;
  }
  return fallback;
}

// True when payment is collected after delivery (cash on delivery, or any
// deferred-payment arrangement). The source of truth is the delivery
// method's `supports_cod` flag — set on the delivery-method admin page.
// Fallback to `payment_method === 'cod'` covers legacy orders created
// before the flag existed, or orders the storefront couldn't attach a
// method to (rare). When true, two things happen:
//   1. The "Awaiting Verification" stage cannot really verify anything —
//      no cash has been collected yet, the order needs to ship first.
//      So we ungate PREPARING and surface a "deferred verification" banner.
//   2. After DELIVERED, SettledStage shows a "record + verify cash" card
//      so accounts can reconcile the rider/courier remittance.
// Anything else is treated as upfront-paid (card, transfer, gateway):
// verification happens before preparation as it does today.
export function isPaymentDeferred(order) {
  if (order?.delivery_method?.supports_cod === true) return true;
  return String(order?.payment_method || "").toLowerCase() === "cod";
}

// Legacy alias — keep until existing callers migrate. New code should
// reach for isPaymentDeferred so the meaning ("COD or other deferred")
// is unambiguous.
export const isCOD = isPaymentDeferred;

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
  originalPrice: "",
  discountSource: "none",
  saleOfferDocumentId: "",
  offerName: "",
  discountReason: "",
};
