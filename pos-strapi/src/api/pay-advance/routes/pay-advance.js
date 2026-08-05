'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::pay-advance.pay-advance');

const customRoutes = [
  { method: 'GET', path: '/pay-advances/mine', handler: 'api::pay-advance.pay-advance.myAdvances' },
  { method: 'POST', path: '/pay-advances/request', handler: 'api::pay-advance.pay-advance.requestAdvance' },
  { method: 'GET', path: '/pay-advances/team', handler: 'api::pay-advance.pay-advance.teamAdvances' },
  { method: 'POST', path: '/pay-advances/:documentId/approve', handler: 'api::pay-advance.pay-advance.approve' },
  { method: 'POST', path: '/pay-advances/:documentId/reject', handler: 'api::pay-advance.pay-advance.reject' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
