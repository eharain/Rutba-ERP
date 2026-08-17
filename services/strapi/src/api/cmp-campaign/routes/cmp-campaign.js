'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::cmp-campaign.cmp-campaign');

const customRoutes = [
  {
    method: 'POST',
    path: '/cmp-campaigns/:documentId/run',
    handler: 'api::cmp-campaign.cmp-campaign.runCampaign',
  },
  {
    method: 'POST',
    path: '/cmp-campaigns/:documentId/cancel',
    handler: 'api::cmp-campaign.cmp-campaign.cancelCampaign',
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
