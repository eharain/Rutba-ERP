'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::cmp-template.cmp-template');

const customRoutes = [
  {
    method: 'POST',
    path: '/cmp-templates/:documentId/preview',
    handler: 'api::cmp-template.cmp-template.getPreview',
  },
  {
    method: 'POST',
    path: '/cmp-templates/:documentId/test-send',
    handler: 'api::cmp-template.cmp-template.sendTest',
  },
  {
    method: 'POST',
    path: '/cmp-templates/:documentId/duplicate',
    handler: 'api::cmp-template.cmp-template.duplicateTemplate',
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
