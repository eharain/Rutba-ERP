'use strict';

/**
 * GET /stock-items/valuation?branch=<documentId>
 *
 * Inventory valuation report (Epic 2) — specific-identification on-hand value:
 * serialized (Σ InStock cost_price) + bulk (Σ Active batch remaining × unit_cost),
 * broken down by branch. This is cost data, not sell prices: manager/admin only.
 *
 * The route is auth:false so Strapi doesn't reject the custom action name,
 * which also skips the api-pro interceptor — the gate below is the only
 * authorization this endpoint gets.
 */

const STOCK_ITEM_UID = 'api::stock-item.stock-item';

const { requireAppRole } = require('../../../utils/require-admin');

module.exports = {
  async run(ctx) {
    const user = await requireAppRole(ctx, strapi, {
      domains: ['inventory', 'stock', 'accounts'],
      levels: ['admin', 'manager'],
      message: 'Inventory / accounts manager access is required',
    });
    if (!user) return;

    const branchDocId = ctx.query?.branch || null;
    const report = await strapi
      .service(STOCK_ITEM_UID)
      .computeInventoryValuation({ branchDocId });

    return ctx.send({ success: true, ...report });
  },
};
