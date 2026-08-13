'use strict';

/**
 * POST /stock-items/recompute-product-stock
 *
 * Admin-triggered job that walks every product and rebuilds
 * `product.stock_quantity` from the live count of InStock stock-items.
 * The stock-item lifecycle keeps the cache fresh during normal operation —
 * this endpoint exists for post-migration backfill, post-incident reconcile,
 * or any time the cache is suspected of drifting.
 *
 * Auth is enforced manually (auth: false on the route) so Strapi doesn't
 * reject the custom action name — which also means the api-pro interceptor
 * never runs, so the descriptor's apps/approle are documentation here, not
 * enforcement. The gate below is the real one.
 */

const { requireAppRole } = require('../../../utils/require-admin');

module.exports = {
  async run(ctx) {
    // Scoped to the three domains whose UIs actually expose this button —
    // rutba-inventory/maintenance, pos-stock/products and rutba-cms/products,
    // matching StockItemsEndpoints.recomputeProductStock's declared
    // apps: ['inventory','stock','cms']. The broad "any *_admin" match this
    // replaced also handed the job to hr_admin, social_admin and friends.
    const user = await requireAppRole(ctx, strapi, {
      domains: ['inventory', 'stock', 'cms'],
      levels: ['admin'],
      message: 'Only inventory/stock/CMS administrators can recompute product stock',
    });
    if (!user) return;

    const summary = await strapi
      .service('api::stock-item.stock-item')
      .recomputeAllProducts();

    strapi.log.info(
      `[recompute-product-stock] triggered by ${user.email || user.username || user.id} — ` +
      `processed=${summary.processed} corrected=${summary.corrected} ms=${summary.durationMs}`
    );

    return ctx.send({ success: true, ...summary });
  },
};
