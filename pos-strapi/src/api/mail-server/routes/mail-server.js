'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::mail-server.mail-server');

// Literal route before the core /:documentId routes (koa-router order).
const customRoutes = [
  {
    method: 'POST',
    path: '/mail-servers/validate',
    handler: 'api::mail-server.mail-server.validateServer',
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
