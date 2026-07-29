'use strict';

/**
 * Cross-instance conversation routes.
 *
 * Two-segment paths so they can never collide with the core router's
 * /order-messages/:documentId, and registered in the alphabetically-first
 * route file so koa-router (first match wins) reaches them first.
 *
 * Both are service-token only — the handlers enforce it. They are the peer's
 * side of the conversation sync, not an app-facing surface.
 */
module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/order-messages/integration/export',
      handler: 'api::order-message.order-message.integrationExport',
    },
    {
      method: 'POST',
      path: '/order-messages/integration/ingest',
      handler: 'api::order-message.order-message.integrationIngest',
    },
  ],
};
