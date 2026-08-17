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
      // Engine-owned writes (tokens, watermarks, enable flags). The core PUT
      // /marketplace-accounts/:id is admin-gated and unreachable with a token.
      method: 'PUT',
      path: '/marketplace-accounts/:id/state',
      handler: 'marketplace-account.patchState',
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
    // Outbound integration: what this instance still owes the peer. The worker
    // reads these, ships them through the adapter, then reports back.
    {
      method: 'GET',
      path: '/marketplace-accounts/:id/outbound-status',
      handler: 'marketplace-account.outboundStatus',
    },
    {
      method: 'GET',
      path: '/marketplace-accounts/:id/outbound-messages',
      handler: 'marketplace-account.outboundMessages',
    },
    {
      method: 'POST',
      path: '/marketplace-accounts/:id/ingest-messages',
      handler: 'marketplace-account.ingestMessages',
    },
    {
      method: 'POST',
      path: '/marketplace-accounts/:id/stamp-messages',
      handler: 'marketplace-account.stampMessages',
    },
  ],
};
