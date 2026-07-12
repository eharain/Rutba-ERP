'use strict';

/**
 * POST /stock-items/sell-units
 *
 * POS immediate-sale allocation for DIVISIBLE products (Divisible P2c). Sells
 * `qty` sub-units of a product across its InStock items (opened-first → FEFO,
 * depleting units flip to 'Sold'), optionally linking the touched units to a
 * sale-item. This is the pos-sale counterpart of the order-management
 * /sale-orders/:id/attach-divisible endpoint — both funnel into the same tested
 * stock-item.allocateSellableUnits engine so allocation/FEFO/pricing stay in one
 * place (stock code lives under api::stock-item).
 *
 * Body:
 *   product_document_id        which product to draw sub-units from   (required)
 *   qty                        sub-units to sell (decimal)            (required)
 *   scanned_item_document_id   (optional) honour this specific unit; warns if it
 *                              skips a nearer-expiry one
 *   sale_item_document_id      (optional) connect consumed units to this sale-item
 *
 * auth:false route + manual auth (mirrors valuation/transfer/expiry). Selling
 * consumes stock with no payment step on this endpoint, so it requires a
 * sale/stock/inventory app-role (any level — POS tellers are sale_staff);
 * a bare storefront JWT is rejected.
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

    const { product_document_id, qty, scanned_item_document_id, sale_item_document_id } = readBody(ctx);
    if (!product_document_id) return ctx.badRequest('product_document_id is required');
    if (!(Number(qty) > 0)) return ctx.badRequest('qty (positive number) is required');

    try {
      const result = await strapi.service(STOCK_ITEM_UID).sellDivisibleUnits(
        product_document_id,
        Number(qty),
        { scannedItemDocId: scanned_item_document_id, saleItemDocId: sale_item_document_id },
      );
      return ctx.send({ success: true, ...result });
    } catch (err) {
      if (err.status === 409) return ctx.conflict(err.message, { available: err.available });
      if (err.status === 400) return ctx.badRequest(err.message);
      if (err.status === 404) return ctx.notFound(err.message);
      strapi.log.warn(`[sell-units] ${product_document_id} × ${qty} failed: ${err.message}`);
      return ctx.throw(500, err.message);
    }
  },
};
