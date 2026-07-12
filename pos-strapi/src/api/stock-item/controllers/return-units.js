'use strict';

/**
 * POST /stock-items/return-units
 *
 * Return `units` sub-units of a DIVISIBLE sale-item back to stock. Releases them
 * against the sale-item's recorded allocations (units_sold decremented, depleted
 * rolls reopened) and rewrites the line's remaining allocations. The refund
 * itself is recorded by the caller's sale-return flow — this endpoint only moves
 * stock, the divisible counterpart of flipping a whole roll to Returned (which
 * the stock-item lifecycle guard blocks for a partially-sold roll).
 *
 * auth:false route + role gate (sale/stock/inventory member) — same access as
 * sell-units, since it's the reverse operation.
 *
 * Body: { sale_item_document_id, units }
 */

const { requireAppRole } = require('../../../utils/require-admin');

const STOCK_ITEM_UID = 'api::stock-item.stock-item';

const requireSeller = (ctx, strapi) => requireAppRole(ctx, strapi, {
  domains: ['sale', 'stock', 'inventory'],
});

function readBody(ctx) {
  const b = ctx.request?.body;
  return (b && typeof b === 'object' && b.data && typeof b.data === 'object') ? b.data : (b || {});
}

module.exports = {
  async run(ctx) {
    const user = await requireSeller(ctx, strapi);
    if (!user) return;

    const { sale_item_document_id, units } = readBody(ctx);
    if (!sale_item_document_id) return ctx.badRequest('sale_item_document_id is required');
    if (!(Number(units) > 0)) return ctx.badRequest('units (positive number) is required');

    try {
      const result = await strapi.service(STOCK_ITEM_UID).returnDivisibleUnits(sale_item_document_id, Number(units));
      return ctx.send({ success: true, ...result });
    } catch (err) {
      if (err.status === 400) return ctx.badRequest(err.message);
      if (err.status === 404) return ctx.notFound(err.message);
      strapi.log.warn(`[return-units] ${sale_item_document_id} × ${units} failed: ${err.message}`);
      return ctx.throw(500, err.message);
    }
  },
};
