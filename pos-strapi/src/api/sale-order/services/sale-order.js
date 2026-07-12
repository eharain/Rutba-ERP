/**
 * order service
 */

const { createCoreService } = require('@strapi/strapi').factories;

const PRICE_EPSILON = 0.01;

const round3 = (n) => Math.round(n * 1000) / 1000;
const round2 = (n) => Math.round(n * 100) / 100;

// Split a line's allocation records into { keep, released } by peeling
// `unitsToRelease` sub-units off the TAIL (most recently allocated first),
// splitting a straddling entry proportionally on price. Pure — the caller
// decides what to do with each side (persist `keep`, hand `released` to
// stock-item.releaseSellableUnits). Passing >= the total releases everything.
function splitAllocationTail(allocations, unitsToRelease) {
  const existing = Array.isArray(allocations) ? allocations : [];
  let toRelease = round3(Number(unitsToRelease) || 0);
  if (toRelease <= 1e-9) return { keep: existing.slice(), released: [] };

  const keep = [];
  const released = [];
  for (let i = existing.length - 1; i >= 0; i--) {
    const a = existing[i];
    const u = Number(a.units) || 0;
    if (toRelease <= 1e-9) { keep.unshift(a); continue; }
    if (u <= toRelease + 1e-9) {
      released.push(a);
      toRelease = round3(toRelease - u);
    } else {
      const rel = round3(toRelease);
      const remain = round3(u - rel);
      const unitPrice = Number(a.unit_price) || 0;
      keep.unshift({ ...a, units: remain, line_total: round2(remain * unitPrice), depleted: false });
      released.push({ ...a, units: rel, line_total: round2(rel * unitPrice) });
      toRelease = 0;
    }
  }
  return { keep, released };
}

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

    // Reconcile-to-target: `qty` is the TOTAL sellable units the line should
    // hold, not an increment. Merge onto (never overwrite) the line's existing
    // allocations so re-running "sell N units" doesn't orphan the units already
    // consumed. Increasing allocates the difference; decreasing releases it from
    // the tail.
    const svc = strapi.service('api::stock-item.stock-item');

    const existing = Array.isArray(items[item_index].allocations) ? items[item_index].allocations : [];
    const existingUnits = round3(existing.reduce((s, a) => s + (Number(a.units) || 0), 0));
    const target = Number(qty);
    const delta = round3(target - existingUnits);

    let mergedAllocs = existing;
    let warning = null;

    if (delta > 1e-9) {
      const result = await svc.allocateSellableUnits(productId, delta, { scannedItemDocId: opts.scannedItemDocId });
      if (result.insufficient) {
        const available = round3(existingUnits + result.available);
        const e = new Error(`Only ${available} sub-unit(s) available`); e.status = 409; e.available = available; throw e;
      }
      mergedAllocs = [...existing, ...result.allocations];
      warning = result.warning || null;
    } else if (delta < -1e-9) {
      // Release the surplus from the tail (most recently allocated first).
      const { keep, released } = splitAllocationTail(existing, -delta);
      if (released.length) await svc.releaseSellableUnits(released, { productId });
      mergedAllocs = keep;
    }

    const totalUnits = round3(mergedAllocs.reduce((s, a) => s + (Number(a.units) || 0), 0));
    const totalPrice = round2(mergedAllocs.reduce((s, a) => s + (Number(a.line_total) || 0), 0));

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
        base.sellable_qty = totalUnits;
        base.allocations = mergedAllocs;
        base.total = totalPrice;
        base.price = mergedAllocs[0]?.unit_price ?? line.price;
        base.stock_item = mergedAllocs[0]?.stock_item ? { documentId: mergedAllocs[0].stock_item } : line.stock_item;
      }
      return base;
    });

    // Keep the order's own subtotal/total in step with the reconciled line so
    // revenue posting (executeTransition → postOrderRevenueAndCogs) doesn't read
    // a stale total. Sum every line's effective total, and preserve the existing
    // shipping/adjustment delta (total − subtotal) on top.
    const orderSubtotal = round2(nextItems.reduce((s, l) => s + (Number(l.total) || 0), 0));
    const shipping = round2(Math.max(0, (Number(order.total) || 0) - (Number(order.subtotal) || 0)));
    const orderTotal = round2(orderSubtotal + shipping);

    const updated = await strapi.documents(SO).update({
      documentId,
      data: { products: { items: nextItems }, subtotal: orderSubtotal, total: orderTotal },
      populate: { products: { populate: { items: true } } },
    });
    return { order: updated, allocation: { units: totalUnits, total: totalPrice, warning, lines: mergedAllocs.length } };
  },

  /**
   * Release divisible-line allocations on an order back to stock, then CLEAR the
   * released portion from each line so a second pass (a workflow that revisits a
   * restock status) can't double-release.
   *
   * Scope depends on why we're restocking:
   *   - CANCELLED (whole order voided, no return-request): release EVERY
   *     divisible line in full.
   *   - RETURNED (partial return via return-request): release ONLY the lines the
   *     customer actually returned — matched by the return-line's
   *     `order_line_index` — and only the returned `quantity` of sub-units, and
   *     only when the restock_decision is back_to_inventory (a damaged writeoff
   *     stays consumed). Kept lines are untouched.
   *
   * Best-effort; safe on orders with no divisible lines.
   */
  async releaseDivisibleForOrder(documentId, opts = {}) {
    const SO = 'api::sale-order.sale-order';
    const order = await strapi.documents(SO).findOne({
      documentId,
      populate: { products: { populate: { items: true } } },
    });
    if (!order) return { released: 0 };
    const lines = order.products?.items || [];

    // Build a per-line-index map of how many sub-units to release.
    // null value = release the whole line (cancel path).
    const toReleaseByIndex = new Map();
    const isReturn = String(opts.status || '').toUpperCase() === 'RETURNED';

    if (isReturn) {
      const returns = await strapi.documents('api::return-request.return-request').findMany({
        filters: { sale_order: { documentId }, status: { $in: ['RECEIVED', 'COMPLETED'] } },
        populate: { items: true },
      });
      for (const ret of (returns || [])) {
        for (const rl of (ret.items || [])) {
          if (rl.restock_decision && rl.restock_decision !== 'back_to_inventory') continue;
          const idx = Number(rl.order_line_index);
          if (!Number.isInteger(idx)) continue;
          const q = round3(Number(rl.quantity) || 0);
          toReleaseByIndex.set(idx, round3((toReleaseByIndex.get(idx) || 0) + q));
        }
      }
      if (toReleaseByIndex.size === 0) return { released: 0 };
    } else {
      // Cancel / unspecified → release every divisible line fully.
      lines.forEach((line, idx) => {
        if (Array.isArray(line.allocations) && line.allocations.length) toReleaseByIndex.set(idx, null);
      });
    }

    const svc = strapi.service('api::stock-item.stock-item');
    let released = 0;
    let mutated = false;
    const nextItems = lines.map((line, idx) => {
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
      return base;
    });

    for (const [idx, qty] of toReleaseByIndex.entries()) {
      const line = lines[idx];
      const allocs = Array.isArray(line?.allocations) ? line.allocations : [];
      if (!allocs.length) continue;
      const totalUnits = round3(allocs.reduce((s, a) => s + (Number(a.units) || 0), 0));
      const releaseUnits = qty == null ? totalUnits : Math.min(qty, totalUnits);
      const { keep, released: releasedAllocs } = splitAllocationTail(allocs, releaseUnits);
      if (!releasedAllocs.length) continue;
      try {
        const r = await svc.releaseSellableUnits(releasedAllocs, { productId: line.product?.id });
        released += r.released;
        // Clear the released portion so a repeat pass can't release it again.
        nextItems[idx].allocations = keep;
        nextItems[idx].sellable_qty = round3(keep.reduce((s, a) => s + (Number(a.units) || 0), 0));
        mutated = true;
      } catch (err) {
        strapi.log.warn(`[sale-order] releaseDivisible line ${idx} failed: ${err.message}`);
      }
    }

    if (mutated) {
      try {
        await strapi.documents(SO).update({ documentId, data: { products: { items: nextItems } } });
      } catch (err) {
        strapi.log.warn(`[sale-order] clearing released allocations for order=${documentId} failed: ${err.message}`);
      }
    }
    return { released };
  },
}));
