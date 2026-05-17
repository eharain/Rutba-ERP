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
  async resolveOfferForProductInGroup(productId, groupDocId) {
    if (!productId || !groupDocId) return null;

    const group = await strapi.documents('api::product-group.product-group').findOne({
      documentId: groupDocId,
      status: 'published',
      fields: ['id'],
      populate: {
        products: { fields: ['id', 'selling_price', 'offer_price'] },
        offers: { fields: ['name', 'active', 'start_date', 'end_date', 'discount_mode', 'discount_value', 'free_shipping', 'priority'] },
      },
    });
    if (!group) return null;

    // Product must belong to this group — otherwise the click context is bogus.
    const product = (group.products || []).find((p) => Number(p.id) === Number(productId));
    if (!product) return null;

    const now = Date.now();
    const liveOffers = (group.offers || []).filter((o) => isOfferLive(o, now));
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
}));