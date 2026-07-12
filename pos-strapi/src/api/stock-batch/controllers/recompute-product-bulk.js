'use strict';

/**
 * POST /stock-batches/recompute-product-bulk
 *
 * Admin-triggered job that walks every product and rebuilds
 * `product.bulk_quantity_on_hand` from the live sum of remaining quantity across
 * its Active batches. The stock-batch lifecycle keeps the cache fresh during
 * normal operation — this endpoint exists for post-migration backfill,
 * post-incident reconcile, or any time the bulk cache is suspected of drifting.
 *
 * Auth is enforced manually (auth: false on the route) so Strapi doesn't reject
 * the custom action name. Mirrors stock-items/recompute-product-stock.
 */

const { requireAppRole } = require('../../../utils/require-admin');

module.exports = {
  async run(ctx) {
    // Scoped to inventory/stock admins — a broad "any *_admin" match would let
    // hr_admin / cms_admin etc. trigger stock reconciliation.
    const user = await requireAppRole(ctx, strapi, {
      domains: ['inventory', 'stock'],
      levels: ['admin'],
      message: 'Only inventory/stock administrators can recompute bulk stock',
    });
    if (!user) return;

    const summary = await strapi
      .service('api::stock-batch.stock-batch')
      .recomputeAllProductsBulk();

    strapi.log.info(
      `[recompute-product-bulk] triggered by ${user.email || user.username || user.id} — ` +
      `processed=${summary.processed} corrected=${summary.corrected} ms=${summary.durationMs}`
    );

    return ctx.send({ success: true, ...summary });
  },
};
