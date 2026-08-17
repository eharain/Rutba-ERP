'use strict';

/**
 * pay-later controller
 *
 * POST /sales/:id/pay-later          → markPayLater
 * POST /sales/:id/pay-later/unlock   → unlockPayLater
 *
 * "Pay Later" lets an admin/manager lock a POS sale so no line-item
 * modification can be made to it — the only exits are Checkout or Unlock.
 * The physical stock the order holds is moved to a status the admin chooses
 * for THIS order (Reserved / Sold / InStock):
 *   - Reserved  → hold the items; nobody else can sell them (default).
 *   - Sold      → goods leave now, customer pays later (true credit sale).
 *   - InStock   → just lock the order lines; don't touch inventory.
 *
 * A pay-later order MUST carry customer information (who owes the money).
 */

// The stock statuses an admin may move a pay-later order's items into.
// 'Sold' is allowed here as a deliberate "goods out, pay later" credit sale.
const ALLOWED_LOCK_STATUSES = ['Reserved', 'Sold', 'InStock'];

// A connected stock item is "available to move" only from these statuses —
// never clobber items already Sold/Returned/etc. on other transactions.
const MOVABLE_FROM = ['Received', 'InStock', 'Reserved'];

// The generated client posts bodies wrapped as { data: {...} }; unwrap it so
// we can read fields directly (matches sale-order.readBody).
function readBody(ctx) {
  const b = ctx.request.body;
  if (b && typeof b === 'object' && b.data && typeof b.data === 'object' && !Array.isArray(b.data)) {
    return b.data;
  }
  return b || {};
}

function actorName(ctx) {
  const u = ctx.state?.user;
  return u?.username || u?.email || u?.name || '';
}

async function loadSaleForLock(id) {
  return strapi.documents('api::sale.sale').findOne({
    documentId: id,
    populate: {
      customer: true,
      items: {
        populate: {
          product: { fields: ['id', 'documentId', 'divisible'] },
          items: { fields: ['id', 'documentId', 'status', 'sellable_units'] },
        },
      },
    },
  });
}

// Apply `targetStatus` to every connected stock item currently in a movable
// state. Returns the number of stock items moved.
async function moveStockItems(sale, targetStatus, movableFrom = MOVABLE_FROM) {
  let moved = 0;
  for (const item of sale.items || []) {
    for (const stock of item.items || []) {
      if (!stock?.documentId) continue;
      if (!movableFrom.includes(stock.status)) continue;
      if (stock.status === targetStatus) continue;
      await strapi.documents('api::stock-item.stock-item').update({
        documentId: stock.documentId,
        data: { status: targetStatus },
      });
      moved += 1;
    }
  }
  return moved;
}

module.exports = {
  async markPayLater(ctx) {
    const { id } = ctx.params;
    const { stock_status = 'Reserved' } = readBody(ctx);

    if (!ALLOWED_LOCK_STATUSES.includes(stock_status)) {
      return ctx.badRequest(
        `stock_status must be one of ${ALLOWED_LOCK_STATUSES.join(', ')}`
      );
    }

    const sale = await loadSaleForLock(id);
    if (!sale) return ctx.notFound('Sale not found');

    if (sale.status === 'Cancelled') {
      return ctx.badRequest('Cannot mark a cancelled sale as pay later');
    }
    if (sale.status === 'Completed' || sale.payment_status === 'Paid') {
      return ctx.badRequest('Sale is already completed');
    }
    if (sale.pay_later) {
      return ctx.badRequest('Sale is already marked as pay later');
    }
    if (!Array.isArray(sale.items) || sale.items.length === 0) {
      return ctx.badRequest('Add at least one item before marking pay later');
    }

    // Pay Later requires customer information — this is who owes the balance.
    const hasCustomer = !!(sale.customer && (sale.customer.name || sale.customer.phone));
    if (!hasCustomer) {
      return ctx.badRequest('A customer (name/phone) is required for a pay-later order');
    }

    // Sold-by-portion (divisible) lines don't reserve whole units and are
    // allocated across the pool at checkout — not supported for pay-later yet.
    // Detect by the product flag OR the line's actual shape: a recorded
    // sellable_qty / allocations, or a linked roll with capacity > 1 (the client
    // enters portion mode on sellable_units > 1 even when the flag is off).
    const hasDivisible = (sale.items || []).some((it) =>
      it?.product?.divisible === true
      || (Number(it?.sellable_qty) || 0) > 0
      || (Array.isArray(it?.allocations) && it.allocations.length > 0)
      || (Array.isArray(it?.items) && it.items.some((s) => (Number(s?.sellable_units) || 1) > 1))
    );
    if (hasDivisible) {
      return ctx.badRequest('Pay Later is not supported for sold-by-portion (divisible) items');
    }

    const moved = await moveStockItems(sale, stock_status);

    const updated = await strapi.documents('api::sale.sale').update({
      documentId: id,
      data: {
        pay_later: true,
        pay_later_at: new Date().toISOString(),
        pay_later_by: actorName(ctx),
        pay_later_stock_status: stock_status,
      },
      populate: { customer: true },
    });

    return ctx.send({ data: updated, stockStatus: stock_status, stockMoved: moved });
  },

  async unlockPayLater(ctx) {
    const { id } = ctx.params;
    // Admin chooses where to put the stock back (default: return to InStock).
    const { stock_status = 'InStock' } = readBody(ctx);

    if (!ALLOWED_LOCK_STATUSES.includes(stock_status)) {
      return ctx.badRequest(
        `stock_status must be one of ${ALLOWED_LOCK_STATUSES.join(', ')}`
      );
    }

    const sale = await loadSaleForLock(id);
    if (!sale) return ctx.notFound('Sale not found');

    if (sale.status === 'Completed') {
      return ctx.badRequest('Cannot unlock a completed sale');
    }
    if (!sale.pay_later) {
      return ctx.badRequest('Sale is not marked as pay later');
    }

    // Only move items still sitting at the status we locked them into, so an
    // unlock never disturbs stock a later action already changed.
    const lockedStatus = sale.pay_later_stock_status || 'Reserved';
    const moved = await moveStockItems(sale, stock_status, [lockedStatus]);

    const updated = await strapi.documents('api::sale.sale').update({
      documentId: id,
      data: {
        pay_later: false,
        pay_later_at: null,
        pay_later_by: null,
        pay_later_stock_status: null,
      },
      populate: { customer: true },
    });

    return ctx.send({ data: updated, stockStatus: stock_status, stockMoved: moved });
  },
};
