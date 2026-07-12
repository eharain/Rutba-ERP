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
      // Variant prices inherit from the parent when the variant row leaves
      // selling_price unset (null) or at 0 — common when staff only fill the
      // parent's price and expect each variant to follow. Without the fallback
      // we'd compute allowedPrice = 0 and silently zero out the order line.
      const variantSelling = Number(variant?.selling_price) || 0;
      const productSelling = Number(product.selling_price) || 0;
      const sellingPrice = variantSelling > 0 ? variantSelling : productSelling;
      const variantOffer = Number(variant?.offer_price) || 0;
      const productOffer = Number(product.offer_price) || 0;
      const productOfferPrice = variantOffer > 0 ? variantOffer : productOffer;

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

  /**
   * Divisible-stock wiring (P2b): allocate `qty` sub-units for an order line whose
   * product is divisible, consume them across InStock items (stock-item.
   * allocateSellableUnits), and store the allocation breakdown + pro-rata price on
   * the line. Unlike whole-item attach (Reserved), divisible units are consumed at
   * allocation time; a return/cancel calls releaseDivisibleForOrder.
   *
   * @returns {{ order, allocation: { units, total, warning, lines } }}
   */
  async attachDivisibleToLine(documentId, item_index, qty, opts = {}) {
    const SO = 'api::sale-order.sale-order';
    const order = await strapi.documents(SO).findOne({
      documentId,
      populate: { products: { populate: { items: { populate: {
        product: { fields: ['id', 'documentId', 'divisible'] },
        stock_item: { fields: ['documentId'] },
      } } } } },
    });
    if (!order) { const e = new Error('Order not found'); e.status = 404; throw e; }
    const items = order.products?.items || [];
    if (!(item_index >= 0 && item_index < items.length)) { const e = new Error(`item_index ${item_index} out of range`); e.status = 400; throw e; }
    const productId = items[item_index].product?.id;
    if (!productId) { const e = new Error('Line has no product'); e.status = 400; throw e; }
    if (items[item_index].product?.divisible !== true) {
      const e = new Error('Product is not divisible — portion allocation is not allowed');
      e.status = 400; throw e;
    }

    const result = await strapi.service('api::stock-item.stock-item').allocateSellableUnits(productId, Number(qty), { scannedItemDocId: opts.scannedItemDocId });
    if (result.insufficient) { const e = new Error(`Only ${result.available} sub-unit(s) available`); e.status = 409; e.available = result.available; throw e; }

    const nextItems = items.map((line, idx) => {
      const base = {
        id: line.id,
        product: line.product?.documentId ? { documentId: line.product.documentId } : line.product,
        quantity: line.quantity,
        price: line.price,
        total: line.total,
        variant: line.variant,
        product_name: line.product_name,
        variant_name: line.variant_name,
        variant_terms: line.variant_terms,
        image: line.image?.id ?? line.image ?? undefined,
        stock_item: line.stock_item?.documentId ? { documentId: line.stock_item.documentId } : line.stock_item,
        sellable_qty: line.sellable_qty,
        allocations: line.allocations,
      };
      if (idx === item_index) {
        base.sellable_qty = result.totalUnits;
        base.allocations = result.allocations;
        base.total = result.totalPrice;
        base.price = result.allocations[0]?.unit_price ?? line.price;
        base.stock_item = result.allocations[0]?.stock_item ? { documentId: result.allocations[0].stock_item } : line.stock_item;
      }
      return base;
    });

    const updated = await strapi.documents(SO).update({
      documentId,
      data: { products: { items: nextItems } },
      populate: { products: { populate: { items: true } } },
    });
    return { order: updated, allocation: { units: result.totalUnits, total: result.totalPrice, warning: result.warning || null, lines: result.allocations.length } };
  },

  /**
   * Release every divisible-line allocation on an order back to stock (return /
   * cancel). Reads each line's stored `allocations` JSON and calls
   * stock-item.releaseSellableUnits. Best-effort; safe on orders with no
   * divisible lines. Returns the count of items restored.
   */
  async releaseDivisibleForOrder(documentId) {
    const order = await strapi.documents('api::sale-order.sale-order').findOne({
      documentId,
      populate: { products: { populate: { items: true } } },
    });
    if (!order) return { released: 0 };
    let released = 0;
    for (const line of (order.products?.items || [])) {
      const allocs = Array.isArray(line.allocations) ? line.allocations : [];
      if (allocs.length) {
        try {
          const r = await strapi.service('api::stock-item.stock-item').releaseSellableUnits(allocs);
          released += r.released;
        } catch (err) {
          strapi.log.warn(`[sale-order] releaseDivisible line failed: ${err.message}`);
        }
      }
    }
    return { released };
  },
}));
