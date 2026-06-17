'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::pay-statutory-remittance.pay-statutory-remittance');

module.exports = {
  get routes() {
    return [
      {
        method: 'POST',
        path: '/pay-statutory-remittances/:documentId/process',
        handler: 'api::pay-statutory-remittance.pay-statutory-remittance.process',
        config: { policies: [] },
      },
      ...defaultRouter.routes,
    ];
  },
};
