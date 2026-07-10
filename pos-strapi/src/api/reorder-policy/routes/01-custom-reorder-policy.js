'use strict';

/**
 * Custom reorder-policy routes.
 *
 * The literal `/reorder-policies/suggestions` MUST be registered before the core
 * `/reorder-policies/:documentId` (first-match router) — the `01-` filename sorts
 * this file ahead of the core router so `suggestions` isn't captured as an id.
 * auth:false + manual ensureUser (like the other inventory custom reads).
 */
module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/reorder-policies/suggestions',
      handler: 'suggestions.getReorderSuggestions',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/reorder-policies/generate-purchases',
      handler: 'generate.generatePurchases',
      config: {
        auth: false,
      },
    },
  ],
};
