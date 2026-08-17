'use strict';

// Custom routes come FIRST, literal path before the :documentId ones — the
// house rule after koa-router's registration-order matching bit us before.

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::cmp-sending-identity.cmp-sending-identity');

const customRoutes = [
  {
    method: 'GET',
    path: '/cmp-sending-identities/mta-health',
    handler: 'api::cmp-sending-identity.cmp-sending-identity.getMtaHealth',
  },
  {
    method: 'POST',
    path: '/cmp-sending-identities/:documentId/setup',
    handler: 'api::cmp-sending-identity.cmp-sending-identity.setupSender',
  },
  {
    method: 'POST',
    path: '/cmp-sending-identities/:documentId/validate',
    handler: 'api::cmp-sending-identity.cmp-sending-identity.validateSender',
  },
  {
    method: 'POST',
    path: '/cmp-sending-identities/:documentId/reset-token',
    handler: 'api::cmp-sending-identity.cmp-sending-identity.resetToken',
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
