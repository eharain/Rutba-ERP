'use strict';

/**
 * Inventory-extras tranche (playbook tranche 4): the reorder/replenishment
 * engine, low-stock alerts and the expiry sweeps — the first CRON migration.
 * The stock-item CORE (sale/allocate/transfer flows) stays in Strapi until
 * tranche 7; this module owns only the replenishment + expiry surface.
 *
 * Zero-copy, same model as tranches 1–3: controllers/services are require()d
 * from services/strapi/src and run against the compat strapi. All routes are
 * `auth: false` in Strapi with manual gates in the controllers (ensureUser /
 * requireAppRole / isReplenishManager) → `selfAuth` here.
 *
 * Lifecycles: none registered here — stock-item and stock-batch lifecycles
 * (which the sweeps rely on to drop Expired rows out of product.stock_quantity
 * and bulk_quantity_on_hand) are already registered by the mfg module;
 * stock-alert / reorder-policy / purchase have no lifecycle files.
 *
 * Crons: the two inventory tasks are read from services/strapi's own
 * config/inventory-cron-tasks.js (zero-copy) and registered with the core
 * scheduler. They stay DORMANT unless RUTBA_CORE_CRONS=1 — at the tranche
 * flip they start here and are simultaneously removed from services/strapi's
 * config/server.js merge (never run in both servers).
 */

const { posRequire } = require('../compat/strapi');
const { registerCron } = require('../platform/cron');

function registerInventoryModule() {
  // ── Crons (zero-copy from services/strapi config) ────────────────────────────
  const buildInventoryCronTasks = posRequire('../config/inventory-cron-tasks.js');
  for (const [name, t] of Object.entries(buildInventoryCronTasks())) {
    registerCron(name, t.options.rule, () => t.task({ strapi: global.strapi }));
  }

  // ── Custom routes ───────────────────────────────────────────────────────
  const suggestions = posRequire('api/reorder-policy/controllers/suggestions.js');
  const generate = posRequire('api/reorder-policy/controllers/generate.js');
  const alertTransitions = posRequire('api/stock-alert/controllers/transitions.js');
  const expiry = posRequire('api/stock-item/controllers/expiry.js');

  const routes = [
    // Literal paths — mount before /reorder-policies/:documentId (module
    // registry mounts before the seeded table, which guarantees it).
    { method: 'get', path: '/api/reorder-policies/suggestions', handler: suggestions.getReorderSuggestions },
    { method: 'post', path: '/api/reorder-policies/generate-purchases', handler: generate.generatePurchases },
    { method: 'post', path: '/api/reorder-policies/generate-work-orders', handler: generate.generateWorkOrders },
    { method: 'post', path: '/api/stock-alerts/run-now', handler: alertTransitions.runNow },
    // Strapi routes use :id — the server's custom-route wrapper aliases
    // documentId → id for the controllers.
    { method: 'post', path: '/api/stock-alerts/:documentId/acknowledge', handler: alertTransitions.acknowledge },
    { method: 'post', path: '/api/stock-alerts/:documentId/dismiss', handler: alertTransitions.dismiss },
    { method: 'get', path: '/api/stock-items/expiring', handler: expiry.getExpiring },
    { method: 'post', path: '/api/stock-items/sweep-expired', handler: expiry.sweepExpired },
  ].map((r) => ({ ...r, selfAuth: true, module: 'inventory' }));

  return { name: 'inventory', routes };
}

module.exports = { registerInventoryModule };
