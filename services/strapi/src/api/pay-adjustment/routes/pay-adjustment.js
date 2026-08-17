'use strict';

/**
 * pay-adjustment router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::pay-adjustment.pay-adjustment');

module.exports = {
  get routes() {
    return [
      {
        method: 'POST',
        path: '/pay-adjustments/:documentId/disburse',
        handler: 'api::pay-adjustment.pay-adjustment.disburse',
        config: { policies: [] },
      },
      ...defaultRouter.routes,
    ];
  },
};
