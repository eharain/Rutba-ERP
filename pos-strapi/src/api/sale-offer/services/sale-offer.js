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
   * Every live offer that reaches a product, with the price each would give.
   *
   * The storefront resolver above needs a group click-context because a
   * customer arrives at a product THROUGH a group, and only that group's
   * offers may apply. Staff entering an order by hand have no such context —
   * they pick a product off a list — so this walks the other direction:
   * product → its product_groups / categories → the offers attached to them.
   * The caller (the order-management line editor) picks one explicitly, and
   * validateOrderPricing re-verifies that choice server-side.
   *
   * `applies_to_web` is NOT filtered here: that flag means "don't surface this
   * on the storefront", and a staff-entered order isn't the storefront. It's
   * returned so the picker can label a non-web promo rather than hide it.
   *
   * @param {string} productDocumentId
   * @returns {Promise<{ product, offers: Array }>} offers sorted best-price-first
   */
  async liveOffersForProduct(productDocumentId) {
    if (!productDocumentId) return { product: null, offers: [] };

    const product = await strapi.documents('api::product.product').findOne({
      documentId: productDocumentId,
      fields: ['id', 'documentId', 'name', 'selling_price', 'offer_price'],
      populate: { categories: { fields: ['documentId', 'name'] } },
    });
    if (!product) return { product: null, offers: [] };

    // product↔product-group is declared only on the group side (no inverse
    // field on product), so the group list can't be populated off the product
    // — it has to be queried from the owning side.
    const groups = await strapi.documents('api::product-group.product-group').findMany({
      status: 'published',
      filters: { products: { documentId: { $eq: productDocumentId } } },
      fields: ['documentId', 'name'],
      pagination: { pageSize: 100 },
    });

    const groupIds = groups.map((g) => g.documentId).filter(Boolean);
    const catIds = (product.categories || []).map((c) => c.documentId).filter(Boolean);
    if (groupIds.length === 0 && catIds.length === 0) return { product, offers: [] };

    const or = [];
    if (groupIds.length) or.push({ product_groups: { documentId: { $in: groupIds } } });
    if (catIds.length) or.push({ categories: { documentId: { $in: catIds } } });

    const offers = await strapi.documents('api::sale-offer.sale-offer').findMany({
      status: 'published',
      filters: { active: { $eq: true }, $or: or },
      fields: [
        'documentId', 'name', 'active', 'start_date', 'end_date',
        'discount_mode', 'discount_value', 'free_shipping', 'priority',
        'applies_to_web', 'createdAt',
      ],
      populate: {
        product_groups: { fields: ['documentId', 'name'] },
        categories: { fields: ['documentId', 'name'] },
      },
      pagination: { pageSize: 100 },
    });

    const now = Date.now();
    const sellingPrice = Number(product.selling_price) || 0;
    const groupSet = new Set(groupIds);
    const catSet = new Set(catIds);

    const out = [];
    for (const o of offers) {
      if (!isOfferLive(o, now)) continue;
      const price = computeDiscountedPrice(o, sellingPrice, product.offer_price);
      // An offer that doesn't actually move the price (discount_mode 'none',
      // or a use_product_offer_price with no offer_price set) is noise in a
      // price picker — unless it grants free shipping, which is still a reason
      // to attach it to the line.
      if (!(price < sellingPrice) && !o.free_shipping) continue;

      const viaGroup = (o.product_groups || []).find((g) => groupSet.has(g.documentId));
      const viaCat = (o.categories || []).find((c) => catSet.has(c.documentId));
      out.push({
        documentId: o.documentId,
        name: o.name,
        discount_mode: o.discount_mode,
        discount_value: o.discount_value,
        free_shipping: !!o.free_shipping,
        applies_to_web: o.applies_to_web !== false,
        priority: Number(o.priority) || 0,
        price,
        savings: Math.max(0, sellingPrice - price),
        via: viaGroup
          ? { type: 'product_group', name: viaGroup.name }
          : viaCat
          ? { type: 'category', name: viaCat.name }
          : null,
      });
    }

    // Cheapest first — staff scanning the list want the best offer on top.
    // Ties break on the editor-set priority, mirroring the storefront resolver.
    out.sort((a, b) => (a.price - b.price) || (b.priority - a.priority));

    return { product, offers: out };
  },

  /**
   * Price a product against ONE specific offer, verifying that offer is live
   * and actually reaches the product. Returns null when it doesn't — which is
   * how validateOrderPricing rejects a line claiming an offer that lapsed,
   * was unpublished, or never covered that product.
   */
  async priceForProductWithOffer(productDocumentId, offerDocumentId) {
    if (!productDocumentId || !offerDocumentId) return null;
    const { product, offers } = await this.liveOffersForProduct(productDocumentId);
    if (!product) return null;
    const match = offers.find((o) => o.documentId === offerDocumentId);
    return match ? { product, offer: match } : null;
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