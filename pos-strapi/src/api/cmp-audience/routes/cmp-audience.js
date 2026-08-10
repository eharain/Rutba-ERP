'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::cmp-audience.cmp-audience');

const customRoutes = [
  {
    method: 'POST',
    path: '/cmp-audiences/:documentId/resolve',
    handler: 'api::cmp-audience.cmp-audience.resolveMembers',
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
