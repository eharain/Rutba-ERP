'use strict';

/**
 * purchase router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::purchase.purchase');

const customRoutes = [
  { method: 'POST', path: '/purchases/:documentId/generate-bill', handler: 'api::purchase.purchase.generateBill' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
