'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::cmp-run.cmp-run');

const customRoutes = [
  {
    // Public MTA webhook — HMAC-authenticated in the service, not JWT'd.
    method: 'POST',
    path: '/cmp/webhook',
    handler: 'api::cmp-run.cmp-run.processWebhook',
    config: { auth: false },
  },
  {
    // Public open pixel — the signed token IS the authentication.
    method: 'GET',
    path: '/cmp/t/o/:token',
    handler: 'api::cmp-run.cmp-run.trackOpen',
    config: { auth: false },
  },
  {
    // Public click redirect — destination resolved server-side by index.
    method: 'GET',
    path: '/cmp/t/c/:token/:link',
    handler: 'api::cmp-run.cmp-run.trackClick',
    config: { auth: false },
  },
  {
    method: 'POST',
    path: '/cmp-runs/:documentId/sync',
    handler: 'api::cmp-run.cmp-run.syncRun',
  },
];

module.exports = {
  get routes() {
    return [
      ...customRoutes,
      ...defaultRouter.routes,
    ];
  },
};
