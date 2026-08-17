'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-asset.hr-asset');

const customRoutes = [
  { method: 'POST', path: '/hr-assets/:documentId/assign', handler: 'api::hr-asset.hr-asset.assign' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
