'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::pay-loan.pay-loan');

const customRoutes = [
  { method: 'GET', path: '/pay-loans/mine', handler: 'api::pay-loan.pay-loan.myLoans' },
  { method: 'POST', path: '/pay-loans/request', handler: 'api::pay-loan.pay-loan.requestLoan' },
  { method: 'GET', path: '/pay-loans/team', handler: 'api::pay-loan.pay-loan.teamLoans' },
  { method: 'POST', path: '/pay-loans/:documentId/approve', handler: 'api::pay-loan.pay-loan.approve' },
  { method: 'POST', path: '/pay-loans/:documentId/reject', handler: 'api::pay-loan.pay-loan.reject' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
