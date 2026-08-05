'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-asset-assignment.hr-asset-assignment');

const customRoutes = [
  { method: 'GET', path: '/hr-asset-assignments/mine', handler: 'api::hr-asset-assignment.hr-asset-assignment.myAssignments' },
  { method: 'POST', path: '/hr-asset-assignments/:documentId/return', handler: 'api::hr-asset-assignment.hr-asset-assignment.returnAsset' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
