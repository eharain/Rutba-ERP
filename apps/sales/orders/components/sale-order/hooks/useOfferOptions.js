import { useCallback, useRef, useState } from "react";
import { SaleOffersEndpoints } from "@rutba/api-provider/endpoints/index.js";

// Per-product discount options for the line editor.
//
// A storefront shopper reaches a product THROUGH a product-group, so the
// server can infer which offers apply from that click-context. Staff picking
// products off a dropdown have no such context, so the options have to be
// fetched per product: GET /sale-offers/for-product/:documentId walks
// product → its groups/categories → the live offers on them.
//
// Results are cached for the life of the editor — staff swap products between
// the same handful of lines and re-fetching each time makes the select
// flicker. The cache is advisory only: whichever offer is chosen gets
// re-verified server-side on save, so a cached entry can never bake in a
// price the server won't stand behind.
export function useOfferOptions() {
  // The cache lives in a ref so ensure() can check it synchronously (a state
  // updater wouldn't run until the next render, so concurrent callers would
  // all miss and re-fetch). `tick` exists only to re-render consumers once an
  // entry lands — they read through get(), which reads the ref.
  const cacheRef = useRef({});
  const inflightRef = useRef(new Set());
  const [, setTick] = useState(0);

  const ensure = useCallback(async (productDocumentId) => {
    const id = String(productDocumentId || "").trim();
    if (!id) return null;

    const cached = cacheRef.current[id];
    if (cached && !cached.error) return cached;
    if (inflightRef.current.has(id)) return null;

    inflightRef.current.add(id);
    try {
      const res = await SaleOffersEndpoints.listOffersForProduct(id);
      const data = res?.data || res || {};
      const entry = {
        sellingPrice: Number(data.product?.selling_price) || 0,
        offerPrice: Number(data.product?.offer_price) || 0,
        offers: Array.isArray(data.offers) ? data.offers : [],
        error: null,
      };
      cacheRef.current = { ...cacheRef.current, [id]: entry };
      setTick((n) => n + 1);
      return entry;
    } catch (err) {
      // Non-fatal: without options the line stays at list price and staff can
      // still take the manual route. Order entry shouldn't die on a lookup.
      console.warn("Failed to load offers for product", id, err);
      const entry = { sellingPrice: 0, offerPrice: 0, offers: [], error: err };
      cacheRef.current = { ...cacheRef.current, [id]: entry };
      setTick((n) => n + 1);
      return entry;
    } finally {
      inflightRef.current.delete(id);
    }
  }, []);

  const get = useCallback(
    (productDocumentId) => cacheRef.current[String(productDocumentId || "")] || null,
    [],
  );

  return { ensure, get };
}

// The offer a fresh line should default to: the cheapest live one. Staff can
// always drop back to list price, but defaulting to full price would quietly
// charge a walk-in customer more than the storefront would have.
export function bestOffer(entry) {
  const selling = Number(entry?.sellingPrice) || 0;
  if (selling <= 0) return null;
  let best = null;
  // liveOffersForProduct already sorts cheapest-first, but don't rely on the
  // wire order — a line's price shouldn't depend on server sort stability.
  for (const o of entry?.offers || []) {
    const p = Number(o.price);
    if (!Number.isFinite(p) || p >= selling) continue;
    if (!best || p < Number(best.price)) best = o;
  }
  return best;
}

// Resolve what a line should look like for a given (product, discount choice).
// Shared by the select handler and the auto-apply on product select so the two
// can't drift. Returns the line fields to merge.
export function priceForChoice(entry, choice) {
  const selling = Number(entry?.sellingPrice) || 0;
  const listPrice = selling > 0 ? String(selling) : "0";
  const base = {
    originalPrice: selling > 0 ? String(selling) : "",
    discountSource: "none",
    saleOfferDocumentId: "",
    offerName: "",
    discountReason: "",
  };

  if (!choice || choice === "none") {
    return { ...base, price: listPrice };
  }
  if (choice === "product_offer_price") {
    const op = Number(entry?.offerPrice) || 0;
    const usable = op > 0 && op < selling;
    return {
      ...base,
      discountSource: usable ? "product_offer_price" : "none",
      price: usable ? String(op) : listPrice,
    };
  }
  if (choice === "manual") {
    // Leave the price alone — staff are about to type over it.
    return { ...base, discountSource: "manual" };
  }

  const offer = (entry?.offers || []).find((o) => o.documentId === choice);
  if (!offer) return { ...base, price: listPrice };
  return {
    ...base,
    discountSource: "offer",
    saleOfferDocumentId: offer.documentId,
    offerName: offer.name || "",
    price: String(offer.price),
  };
}

// The value the discount <select> should show for a line.
export function choiceForLine(line) {
  if (line.discountSource === "offer") return line.saleOfferDocumentId || "none";
  if (line.discountSource === "product_offer_price") return "product_offer_price";
  if (line.discountSource === "manual") return "manual";
  return "none";
}
