'use strict';

// Standalone marketplace sync worker — a SEPARATE process from the Next.js web
// UI (run with `npm run worker`, or `npm run worker:marketplace` from the root
// so load-env injects the RUTBA_MARKETPLACE__* env).
//
// Why separate: a sync run (pulling/ingesting orders, pushing inventory across
// many SKUs) can take an arbitrary amount of time and must not ride the web
// server's event loop. This process owns the schedule; the web app is UI-only.
//
// The job runner (lib/jobs.js) is queue-shaped, so this in-process scheduler can
// later be replaced by BullMQ/pub-sub and run as N consumers without touching
// the engine.

const config = require('./lib/config');
const engine = require('./lib/engine');
const { createJobRunner } = require('./lib/jobs');

function main() {
  if (!config.worker.enabled) {
    console.log('[marketplace worker] disabled (WORKER_ENABLED=false) — exiting');
    return;
  }
  if (!config.strapi.token) {
    console.warn('[marketplace worker] STRAPI_SERVICE_TOKEN not set — Strapi calls will fail until it is configured');
  }

  const runner = createJobRunner({ backend: config.worker.backend });

  runner.defineJob('orders', () => engine.syncAllOrders());
  runner.defineJob('inventory', () => engine.syncAllInventory());
  runner.defineJob('catalog', () => engine.syncAllCatalog());
  runner.defineJob('refreshTokens', () => engine.refreshExpiringTokens());

  // initialDelayMs is staggered minutes apart so a worker (re)start doesn't fire
  // all three jobs in the first 30s — there's a few-minutes gap before the first
  // poll of each job, and they don't pile onto each other.
  runner.scheduleRecurring('orders', config.worker.ordersRule, { fallbackMs: 15 * 60 * 1000, initialDelayMs: 2 * 60 * 1000 });
  runner.scheduleRecurring('inventory', config.worker.inventoryRule, { fallbackMs: 60 * 60 * 1000, initialDelayMs: 4 * 60 * 1000 });
  runner.scheduleRecurring('catalog', config.worker.catalogRule, { fallbackMs: 6 * 60 * 60 * 1000, initialDelayMs: 8 * 60 * 1000 });
  runner.scheduleRecurring('refreshTokens', config.worker.refreshRule, { fallbackMs: 4 * 60 * 60 * 1000, initialDelayMs: 6 * 60 * 1000 });

  console.log(`[marketplace worker] up (backend=${runner.backend}); Strapi=${config.strapi.apiUrl}`);

  const shutdown = (sig) => { console.log(`[marketplace worker] ${sig} — exiting`); process.exit(0); };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
