'use strict';

// Worker-only marketplace-account routes. NOT auth:false — Strapi must
// authenticate the API token so ctx.state.auth is populated and the handler's
// isServiceToken() gate can fire. (A no-user token request is skipped by the
// api-pro interceptor, so these never need an api-pro policy.)
//
// Both carry an extra path segment beyond `/:id`, so they don't collide with
// the core findOne/update routes.

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/marketplace-accounts/:id/secrets',
      handler: 'marketplace-account.getSecrets',
    },
    {
      method: 'POST',
      path: '/marketplace-accounts/:id/ingest-orders',
      handler: 'marketplace-account.ingestOrders',
    },
    {
      method: 'POST',
      path: '/marketplace-accounts/:id/offer-prices',
      handler: 'marketplace-account.offerPrices',
    },
  ],
};
