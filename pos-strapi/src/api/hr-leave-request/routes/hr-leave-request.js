'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-leave-request.hr-leave-request');

const customRoutes = [
  {
    method: 'GET',
    path: '/hr-leave-requests/my-requests',
    handler: 'api::hr-leave-request.hr-leave-request.myRequests',
  },
  {
    method: 'GET',
    path: '/hr-leave-requests/team-queue',
    handler: 'api::hr-leave-request.hr-leave-request.teamQueue',
  },
  {
    method: 'POST',
    path: '/hr-leave-requests/:documentId/approve',
    handler: 'api::hr-leave-request.hr-leave-request.approve',
  },
  {
    method: 'POST',
    path: '/hr-leave-requests/:documentId/reject',
    handler: 'api::hr-leave-request.hr-leave-request.reject',
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
