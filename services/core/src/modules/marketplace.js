'use strict';

/**
 * Marketplace tranche (playbook tranche 6): the marketplace-account credential
 * CRUD overrides + the apps/sales/marketplace WORKER surface. The engine (adapters,
 * OAuth, scheduling, outbound HTTP) lives in the apps/sales/marketplace app — the
 * Strapi side is only the data contract, so this tranche is small: the other
 * marketplace CTs (listing, mapping, price-rule, sync-log) are plain CRUD
 * already served by the seeded route table.
 *
 * Zero-copy, same model as tranches 1–5. Auth model: NONE of these routes is
 * auth:false — the worker authenticates with a Strapi API token (core's auth
 * sets ctx.state.auth with the 'content-api-token' strategy shape, so the
 * ported isServiceToken() gate works verbatim), and a token request carries no
 * user, so the api-pro interceptor skips it in both servers. Operator-facing
 * create/update/delete are interceptor-gated core-action overrides (hr
 * pattern) with the DB-backed marketplace_admin gate inside the controller.
 *
 * Reach: ingest-orders creates sale-orders (products component tree, person
 * dedup via the ported crm service, address rows) and the cancel-sync path +
 * peer status application run the ORDER STATE MACHINE zero-copy — its stock
 * and notification side effects fire through lifecycles already registered by
 * the mfg/hr tranches (stock-item, stock-batch, acc-*, sale-order). The
 * sale/stock cluster itself remains Strapi-owned until tranche 7; this module
 * only exercises the same shared code paths the descriptors already route
 * through services/strapi today.
 *
 * Crons: none (the worker schedules itself inside apps/sales/marketplace).
 * Lifecycles: none new (sale-order registered by hr; order-message has none).
 */

const path = require('path');
const { posRequire, instantiateController } = require('../compat/strapi');

function registerMarketplaceModule() {
  const strapi = global.strapi;

  const account = instantiateController(
    posRequire(path.join('api', 'marketplace-account', 'controllers', 'marketplace-account.js')),
    strapi
  );

  const ACC = 'api::marketplace-account.marketplace-account';

  const routes = [
    // ── worker surface (service token; literal segment after :documentId) ──
    { method: 'get', path: '/api/marketplace-accounts/:documentId/secrets', action: 'getSecrets', handler: (c) => account.getSecrets(c) },
    { method: 'put', path: '/api/marketplace-accounts/:documentId/state', action: 'patchState', handler: (c) => account.patchState(c) },
    { method: 'post', path: '/api/marketplace-accounts/:documentId/ingest-orders', action: 'ingestOrders', handler: (c) => account.ingestOrders(c) },
    { method: 'post', path: '/api/marketplace-accounts/:documentId/offer-prices', action: 'offerPrices', handler: (c) => account.offerPrices(c) },
    { method: 'get', path: '/api/marketplace-accounts/:documentId/outbound-status', action: 'outboundStatus', handler: (c) => account.outboundStatus(c) },
    { method: 'get', path: '/api/marketplace-accounts/:documentId/outbound-messages', action: 'outboundMessages', handler: (c) => account.outboundMessages(c) },
    { method: 'post', path: '/api/marketplace-accounts/:documentId/ingest-messages', action: 'ingestMessages', handler: (c) => account.ingestMessages(c) },
    { method: 'post', path: '/api/marketplace-accounts/:documentId/stamp-messages', action: 'stampMessages', handler: (c) => account.stampMessages(c) },

    // ── operator credential CRUD (core-action overrides) ───────────────────
    { method: 'post', path: '/api/marketplace-accounts', action: 'create', handler: (c) => account.create(c) },
    { method: 'put', path: '/api/marketplace-accounts/:documentId', action: 'update', handler: (c) => account.update(c) },
    { method: 'delete', path: '/api/marketplace-accounts/:documentId', action: 'delete', handler: (c) => account.delete(c) },
  ].map((r) => ({ ...r, uid: ACC, module: 'marketplace' }));

  return { name: 'marketplace', routes };
}

module.exports = { registerMarketplaceModule };
