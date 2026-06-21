'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

// Storefront offer resolution.
//
// When a product detail page is reached with a `groupId` query, the
// storefront treats the click as "from this group" — and any group-level
// offer attached to that group can apply. We pick deterministically by the
// editor-set `priority` (higher wins), tie-breaking on createdAt:DESC so the
// most recently authored wins among equals.
//
// One offer applies at a time for price purposes, but `free_shipping` is
// OR'd across all active offers attached to the group (so "20% off + free
// shipping" can be expressed as two offers on the same group).
function isOfferLive(offer, now) {
  if (!offer || offer.active === false) return false;
  const start = offer.start_date ? new Date(offer.start_date).getTime() : null;
  const end = offer.end_date ? new Date(offer.end_date).getTime() : null;
  if (start != null && start > now) return false;
  if (end != null && end < now) return false;
  return true;
}

function computeDiscountedPrice(offer, sellingPrice, productOfferPrice) {
  const base = Number(sellingPrice) || 0;
  switch (offer.discount_mode) {
    case 'percent_off': {
      const pct = Math.max(0, Math.min(100, Number(offer.discount_value) || 0));
      return Math.max(0, base * (1 - pct / 100));
    }
    case 'fixed_off': {
      const off = Math.max(0, Number(offer.discount_value) || 0);
      return Math.max(0, base - off);
    }
    case 'use_product_offer_price': {
      const op = Number(productOfferPrice) || 0;
      return op > 0 && op < base ? op : base;
    }
    case 'none':
    default:
      return base;
  }
}

module.exports = createCoreService('api::sale-offer.sale-offer', ({ strapi }) => ({
  /**
   * Resolve the effective offer for a (product, group) pair.
   * Returns null when no group context or no active offer applies.
   *
   * Output shape:
   *   {
   *     offer:        the active sale-offer record that won (by priority)
   *     finalPrice:   the customer-visible price after the offer
   *     originalPrice the product's selling_price (so storefront can render strike-through)
   *     savingsPct:   integer 0-100
   *     freeShipping: bool, OR'd across all live offers on the group
   *   }
   */
  async resolveOfferForProductInGroup(productId, groupSlugOrDocId) {
    if (!productId || !groupSlugOrDocId) return null;

    // Slug is the canonical key from the storefront; documentId is the
    // backward-compat fallback for any cached/legacy traffic.
    const groupPopulate = {
      products: { fields: ['id', 'selling_price', 'offer_price'] },
      offers: { fields: ['name', 'active', 'start_date', 'end_date', 'discount_mode', 'discount_value', 'free_shipping', 'priority', 'applies_to_web'] },
    };
    let group = await strapi.documents('api::product-group.product-group').findFirst({
      status: 'published',
      filters: { slug: { $eq: groupSlugOrDocId } },
      fields: ['id'],
      populate: groupPopulate,
    });
    if (!group) {
      group = await strapi.documents('api::product-group.product-group').findOne({
        documentId: groupSlugOrDocId,
        status: 'published',
        fields: ['id'],
        populate: groupPopulate,
      });
    }
    if (!group) return null;

    // Product must belong to this group — otherwise the click context is bogus.
    const product = (group.products || []).find((p) => Number(p.id) === Number(productId));
    if (!product) return null;

    const now = Date.now();
    // Storefront path: only offers that apply to web (a Daraz-only promo sets
    // applies_to_web=false so it never shows on the storefront).
    const liveOffers = (group.offers || []).filter((o) => isOfferLive(o, now) && o.applies_to_web !== false);
    if (liveOffers.length === 0) return null;

    // Highest priority wins for price. Free shipping is OR'd across all.
    const sorted = [...liveOffers].sort((a, b) => {
      const pa = Number(a.priority) || 0;
      const pb = Number(b.priority) || 0;
      if (pa !== pb) return pb - pa;
      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return cb - ca;
    });
    const priced = sorted.find((o) => o.discount_mode && o.discount_mode !== 'none') || null;
    const freeShipping = liveOffers.some((o) => !!o.free_shipping);

    const originalPrice = Number(product.selling_price) || 0;
    const finalPrice = priced
      ? computeDiscountedPrice(priced, originalPrice, product.offer_price)
      : originalPrice;
    const savingsPct = originalPrice > 0 && finalPrice < originalPrice
      ? Math.round(((originalPrice - finalPrice) / originalPrice) * 100)
      : 0;

    return {
      offer: priced || liveOffers[0],
      finalPrice,
      originalPrice,
      savingsPct,
      freeShipping,
    };
  },

  /**
   * Resolve the best live marketplace offer price per product for a given
   * marketplace account, reusing the storefront's discount engine. An offer
   * applies to a marketplace only when that account is in the offer's
   * `marketplaces` relation. Targeting is via the offer's product_groups
   * (category-scoped marketplace offers are not resolved here yet).
   *
   * @returns {Object} { [productDocumentId]: { finalPrice, offerName } }
   */
  async marketplaceOfferPrices(accountDocumentId, productDocumentIds = []) {
    const ids = (productDocumentIds || []).filter(Boolean).map(String);
    if (!accountDocumentId || ids.length === 0) return {};
    const idSet = new Set(ids);

    const offers = await strapi.documents('api::sale-offer.sale-offer').findMany({
      status: 'published',
      filters: {
        active: { $eq: true },
        marketplaces: { documentId: { $eq: accountDocumentId } },
      },
      fields: ['name', 'active', 'start_date', 'end_date', 'discount_mode', 'discount_value', 'priority', 'createdAt'],
      populate: {
        product_groups: { populate: { products: { fields: ['documentId', 'selling_price', 'offer_price'] } } },
      },
      pagination: { pageSize: 200 },
    });

    const now = Date.now();
    // Live + actually-discounting, highest priority first (then newest).
    const live = offers
      .filter((o) => isOfferLive(o, now) && o.discount_mode && o.discount_mode !== 'none')
      .sort((a, b) => {
        const pa = Number(a.priority) || 0;
        const pb = Number(b.priority) || 0;
        if (pa !== pb) return pb - pa;
        const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return cb - ca;
      });

    const out = {};
    for (const o of live) {
      for (const g of (o.product_groups || [])) {
        for (const p of (g.products || [])) {
          const pid = p.documentId;
          if (!pid || !idSet.has(String(pid)) || out[pid]) continue; // first (highest priority) wins
          const finalPrice = computeDiscountedPrice(o, p.selling_price, p.offer_price);
          if (finalPrice > 0 && finalPrice < (Number(p.selling_price) || 0)) {
            out[pid] = { finalPrice, offerName: o.name };
          }
        }
      }
    }
    return out;
  },
}));