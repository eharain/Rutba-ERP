'use strict';

/**
 * Module registry — one entry per migration tranche (playbook order:
 * mfg → hr/payroll → crm → inventory-extras → cms/social → marketplace →
 * sale/stock/accounting → auth).
 *
 * initModules() runs every registered module's registration (document
 * middlewares + lifecycle adapters happen inside) and returns the combined
 * custom-route list for the HTTP layer to mount BEFORE the descriptor-seeded
 * table — module routes override seeded rows (some custom actions are seeded
 * with action 'create' for the verb whitelist and would otherwise mount as
 * plain create handlers on the custom path).
 *
 * ARRAY ORDER IS ROUTE PRECEDENCE. server.js mounts these in order and the
 * first module to claim a verb+path keeps it, so two modules registering the
 * same route is resolved here rather than there. Helpdesk sits before crm for
 * exactly that reason: it reimplements the seven /api/contact-tickets/* legacy
 * contracts over TicketService (F13), and crm's ported services/strapi versions of
 * the same routes must not win. crm keeps its address and crm-lead routes.
 */

const { registerMfgModule } = require('./mfg');
const { registerHrModule } = require('./hr');
const { registerHelpdeskModule } = require('./helpdesk');
const { registerCrmModule } = require('./crm');
const { registerInventoryModule } = require('./inventory');
const { registerCmsSocialModule } = require('./cms-social');
const { registerMarketplaceModule } = require('./marketplace');
const { registerSaleStockModule } = require('./sale-stock');
const { registerAuthModule } = require('./auth');
const { registerCatalogModule } = require('./catalog');
const { registerUploadsModule } = require('./uploads');
const { registerUserMgmtModule } = require('./user-mgmt');

let initialized = null;

function initModules() {
  if (initialized) return initialized;
  const modules = [
    registerMfgModule(),
    registerHrModule(),
    registerHelpdeskModule(),
    registerCrmModule(),
    registerInventoryModule(),
    registerCmsSocialModule(),
    registerMarketplaceModule(),
    registerSaleStockModule(),
    registerAuthModule(),
    registerCatalogModule(),
    registerUploadsModule(),
    registerUserMgmtModule(),
  ];
  const routes = modules.flatMap((m) => m.routes || []);
  initialized = { modules: modules.map((m) => m.name), routes };
  return initialized;
}

module.exports = { initModules };
