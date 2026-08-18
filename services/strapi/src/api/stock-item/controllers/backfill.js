'use strict';

/**
 * POST /stock-items/backfill-default-locations
 *
 * Admin-triggered one-time job that gives every branch a default receiving
 * storage-location, places every stock-item that lacks a location into its
 * branch's receiving loc (branch-less items also get a fallback branch), then
 * rebuilds the stock-level cache. Idempotent — safe to re-run; it only touches
 * stock-items that lack a location.
 *
 * This is the Foundation backfill (Epic 2 Phase 1), relocated off the retired
 * /warehouses resource when warehouse merged into branch. It runs on demand
 * rather than at boot so a large catalog isn't migrated during startup, and so
 * it can be re-triggered after suspected drift. Auth is enforced manually
 * (auth: false on the route) so Strapi doesn't reject the custom action name —
 * same pattern as stock-items/recompute-product-stock and stock-items/transfer.
 * Called from apps/inventory/control's maintenance page, which already tells the
 * operator a non-admin gets a 403 back.
 */

const { requireAppRole } = require('../../../utils/require-admin');

module.exports = {
  async run(ctx) {
    // Scoped to inventory/stock admins — the broad "any *_admin" match this
    // replaced let hr_admin / cms_admin etc. rewrite every stock location.
    const user = await requireAppRole(ctx, strapi, {
      domains: ['inventory', 'stock'],
      levels: ['admin'],
      message: 'Only inventory/stock administrators can backfill default locations',
    });
    if (!user) return;

    const summary = await strapi
      .service('api::stock-item.stock-item')
      .backfillDefaultLocations();

    strapi.log.info(
      `[stock-items/backfill-default-locations] triggered by ${user.email || user.username || user.id} — ` +
      `branchesCreated=${summary.branchesCreated} locationsCreated=${summary.locationsCreated} ` +
      `itemsPlaced=${summary.itemsPlaced} ms=${summary.durationMs}`
    );

    return ctx.send({ success: true, ...summary });
  },
};
