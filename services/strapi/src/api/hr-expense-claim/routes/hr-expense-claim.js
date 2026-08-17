'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-expense-claim.hr-expense-claim');

const customRoutes = [
  { method: 'GET', path: '/hr-expense-claims/mine', handler: 'api::hr-expense-claim.hr-expense-claim.myClaims' },
  { method: 'POST', path: '/hr-expense-claims/submit', handler: 'api::hr-expense-claim.hr-expense-claim.submitClaim' },
  { method: 'GET', path: '/hr-expense-claims/team', handler: 'api::hr-expense-claim.hr-expense-claim.teamClaims' },
  { method: 'POST', path: '/hr-expense-claims/:documentId/approve', handler: 'api::hr-expense-claim.hr-expense-claim.approve' },
  { method: 'POST', path: '/hr-expense-claims/:documentId/reject', handler: 'api::hr-expense-claim.hr-expense-claim.reject' },
  { method: 'POST', path: '/hr-expense-claims/:documentId/reimburse', handler: 'api::hr-expense-claim.hr-expense-claim.reimburse' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
