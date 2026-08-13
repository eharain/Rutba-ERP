'use strict';

/**
 * POST /stock-levels/recompute
 *
 * Admin-triggered job that rebuilds the per-(product, branch) stock-level
 * cache from the live stock-item rows. Idempotent — run after the location
 * backfill, after suspected drift, or as an ad-hoc reconcile. The stock-item
 * lifecycle keeps stock-levels fresh during normal operation; this is the
 * full-DB rebuild (the stock-level twin of stock-items/recompute-product-stock).
 *
 * Auth enforced manually (auth: false on the route) so Strapi doesn't reject
 * the custom action name — same pattern as recompute-product-stock.
 */

const { requireAppRole } = require('../../../utils/require-admin');

module.exports = {
  async run(ctx) {
    // Scoped to inventory/stock admins — the broad "any *_admin" match this
    // replaced let hr_admin / cms_admin etc. trigger a full-DB stock rebuild.
    const user = await requireAppRole(ctx, strapi, {
      domains: ['inventory', 'stock'],
      levels: ['admin'],
      message: 'Only inventory/stock administrators can recompute stock levels',
    });
    if (!user) return;

    const summary = await strapi
      .service('api::stock-item.stock-item')
      .recomputeAllStockLevels();

    strapi.log.info(
      `[stock-levels/recompute] triggered by ${user.email || user.username || user.id} — ` +
      `processed=${summary.processed} levelsWritten=${summary.levelsWritten} ms=${summary.durationMs}`
    );

    return ctx.send({ success: true, ...summary });
  },
};
