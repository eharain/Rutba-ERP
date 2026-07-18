'use strict';

/**
 * Inventory Foundation backfill (Epic 2 Phase 1) — registry seeder.
 *
 * Runs the same idempotent backfill exposed at
 * POST /stock-items/backfill-default-locations:
 *
 *   1. Ensure every branch has a default receiving location.
 *   2. Place every stock-item that lacks a location into its branch's receiving loc.
 *   3. Rebuild the per-(product, branch) stock-level cache.
 *
 * Non-destructive (no deletes, no status changes), idempotent, safe to re-run.
 * The standalone diagnostic runner (scripts/backfill-inventory-foundation.js)
 * calls this same function and then verifies the load-bearing invariant.
 *
 * @param {import('@strapi/strapi').Core.Strapi} strapi
 * @returns {Promise<{created:number, updated:number, skipped:number, backfill:any}>}
 */

const STOCK_ITEM = 'api::stock-item.stock-item';
const STOCK_LEVEL = 'api::stock-level.stock-level';
const LOCATION = 'api::storage-location.storage-location';

async function backfillInventoryFoundation(strapi) {
    const svc = strapi.service(STOCK_ITEM);

    const before = {
        locations: await strapi.db.query(LOCATION).count(),
        stockLevels: await strapi.db.query(STOCK_LEVEL).count(),
    };

    const backfill = await svc.backfillDefaultLocations();

    const after = {
        locations: await strapi.db.query(LOCATION).count(),
        stockLevels: await strapi.db.query(STOCK_LEVEL).count(),
    };

    // Report new infrastructure rows as "created"; stock-level rebuild is an
    // update-in-place operation so surface its own count where the service
    // provides one, else fall back to the delta.
    const created =
        Math.max(0, after.locations - before.locations) +
        Math.max(0, after.stockLevels - before.stockLevels);

    return { created, updated: 0, skipped: 0, backfill };
}

module.exports = { backfillInventoryFoundation };
