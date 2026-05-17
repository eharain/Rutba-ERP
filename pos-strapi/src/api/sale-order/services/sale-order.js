/**
 * order service
 */

const { createCoreService } = require('@strapi/strapi').factories;

const PRICE_EPSILON = 0.01;

module.exports = createCoreService('api::sale-order.sale-order', ({ strapi }) => ({
  /**
   * Re-validate every line of an inbound order against the live product +
   * group-offer state. Client-supplied prices are never trusted — we look up
   * the canonical selling_price for the product/variant, then ask the
   * sale-offer resolver whether the supplied `source_group_id` still grants
   * a discount.
   *
   * Returns:
   *   {
   *     items:           items with server-validated `price` and `total`,
   *     subtotal:        sum of item totals (server-computed),
   *     originalSubtotal: sum of selling-price totals (pre-offer),
   *     savings:         originalSubtotal - subtotal (≥ 0),
   *     freeShipping:    true iff any line's source group had a live
   *                      free_shipping offer at order time,
   *     expired:         array of { documentId, reason } for lines whose
   *                      client price was strictly cheaper than what's now
   *                      allowed (i.e. the offer they relied on lapsed),
   *   }
   *
   * The caller decides whether to reject (when `expired.length > 0`) or to
   * write the corrected prices through.
   */
  async validateOrderPricing(items = []) {
    const offerService = strapi.service('api::sale-offer.sale-offer');
    const out = [];
    const expired = [];
    let subtotal = 0;
    let originalSubtotal = 0;
    let freeShipping = false;

    for (const item of items || []) {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const productDocId = item.product;
      const variantId = item.variant ? Number(item.variant) : null;
      const clientPrice = Number(item.price) || 0;

      // Selling/offer price MUST come from the DB; never trust the client.
      const product = productDocId
        ? await strapi.documents('api::product.product').findOne({
            documentId: productDocId,
            status: 'published',
            fields: ['id', 'name', 'selling_price', 'offer_price'],
            populate: { variants: { fields: ['id', 'selling_price', 'offer_price'] } },
          })
        : null;
      if (!product) {
        expired.push({ documentId: productDocId, reason: 'product not found or unpublished' });
        // Pass through whatever we got so the controller can surface a clear error.
        out.push({ ...item, price: clientPrice, total: clientPrice * qty });
        originalSubtotal += clientPrice * qty;
        subtotal += clientPrice * qty;
        continue;
      }

      const variant = variantId
        ? (product.variants || []).find((v) => Number(v.id) === variantId)
        : null;
      const sellingPrice = Number((variant || product).selling_price) || 0;
      const productOfferPrice = Number((variant || product).offer_price) || 0;

      // Resolve current offer for this (product, group). Returns null when
      // there's no group context or no live offer applies.
      let resolved = null;
      if (item.source_group_id) {
        resolved = await offerService.resolveOfferForProductInGroup(product.id, item.source_group_id);
        if (resolved?.freeShipping) freeShipping = true;
      }

      // Server's view of what the customer is allowed to pay right now. The
      // resolver was built around the parent product's selling_price; for
      // variants we replay the same math against the variant's prices so the
      // per-variant offer (percent/fixed) carries through.
      let allowedPrice = sellingPrice;
      if (resolved?.offer) {
        const mode = resolved.offer.discount_mode;
        const value = Number(resolved.offer.discount_value) || 0;
        if (mode === 'percent_off') {
          allowedPrice = Math.max(0, sellingPrice * (1 - Math.max(0, Math.min(100, value)) / 100));
        } else if (mode === 'fixed_off') {
          allowedPrice = Math.max(0, sellingPrice - Math.max(0, value));
        } else if (mode === 'use_product_offer_price') {
          allowedPrice = productOfferPrice > 0 && productOfferPrice < sellingPrice
            ? productOfferPrice
            : sellingPrice;
        }
      }

      // Customer paying STRICTLY less than the current allowed price means
      // they relied on an offer that's no longer live. Flag for the caller.
      if (clientPrice + PRICE_EPSILON < allowedPrice) {
        expired.push({
          documentId: productDocId,
          reason: 'offer no longer valid; submitted price below currently allowed price',
          submittedPrice: clientPrice,
          allowedPrice,
        });
      }

      const finalPrice = allowedPrice;
      const lineTotal = finalPrice * qty;
      const originalLine = sellingPrice * qty;

      out.push({
        ...item,
        price: finalPrice,
        total: lineTotal,
      });
      subtotal += lineTotal;
      originalSubtotal += originalLine;
    }

    const savings = Math.max(0, originalSubtotal - subtotal);
    return { items: out, subtotal, originalSubtotal, savings, freeShipping, expired };
  },
}));
