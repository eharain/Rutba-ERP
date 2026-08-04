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
 */

const { registerMfgModule } = require('./mfg');
const { registerHrModule } = require('./hr');
const { registerCrmModule } = require('./crm');
const { registerInventoryModule } = require('./inventory');
const { registerCmsSocialModule } = require('./cms-social');
const { registerMarketplaceModule } = require('./marketplace');
const { registerSaleStockModule } = require('./sale-stock');
const { registerAuthModule } = require('./auth');
const { registerCatalogModule } = require('./catalog');

let initialized = null;

function initModules() {
  if (initialized) return initialized;
  const modules = [
    registerMfgModule(),
    registerHrModule(),
    registerCrmModule(),
    registerInventoryModule(),
    registerCmsSocialModule(),
    registerMarketplaceModule(),
    registerSaleStockModule(),
    registerAuthModule(),
    registerCatalogModule(),
  ];
  const routes = modules.flatMap((m) => m.routes || []);
  initialized = { modules: modules.map((m) => m.name), routes };
  return initialized;
}

module.exports = { initModules };
