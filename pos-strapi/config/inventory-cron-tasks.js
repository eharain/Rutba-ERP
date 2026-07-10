'use strict';

// Inventory background jobs. Wired into Strapi via config/server.js
// (`cron: { enabled, tasks }`, merged with the social tasks). Each task is
// defensive — a throw inside one run must not crash the scheduler.
//
//   inventoryExpirySweep — flip every past-expiry InStock unit and every Active
//   past-expiry stock-batch to 'Expired'. The stock-item / stock-batch lifecycles
//   then drop them out of product.stock_quantity / bulk_quantity_on_hand. This is
//   the automated driver behind Epic 5 "block-expired"; the manual endpoint
//   POST /stock-items/sweep-expired runs the same service. Status only — never
//   posts GL (the write-off adjustment books the loss).

const STOCK_ITEM_UID = 'api::stock-item.stock-item';

module.exports = function buildInventoryCronTasks(rules = {}) {
  return {
    inventoryExpirySweep: {
      task: async ({ strapi }) => {
        try {
          const res = await strapi.service(STOCK_ITEM_UID).sweepExpired();
          if (res.items || res.batches) {
            strapi.log.info(`[inventory] expiry sweep: ${res.items} unit(s) + ${res.batches} batch(es) → Expired (asOf ${res.asOf})`);
          }
        } catch (e) {
          strapi.log.warn(`[inventory] cron expirySweep failed: ${e.message}`);
        }
      },
      // Daily at 02:15 by default — after midnight so "today" is correct.
      options: { rule: rules.expirySweepRule || '15 2 * * *' },
    },
  };
};
