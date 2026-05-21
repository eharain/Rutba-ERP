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
};
