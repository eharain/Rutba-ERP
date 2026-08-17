'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::pay-payroll-run.pay-payroll-run');

// Literal/longer paths first so they are not shadowed by the core `/:id` route.
const customRoutes = [
  { method: 'POST', path: '/pay-payroll-runs/:documentId/preview', handler: 'api::pay-payroll-run.pay-payroll-run.preview' },
  { method: 'POST', path: '/pay-payroll-runs/:documentId/process', handler: 'api::pay-payroll-run.pay-payroll-run.process' },
  { method: 'POST', path: '/pay-payroll-runs/:documentId/cancel',  handler: 'api::pay-payroll-run.pay-payroll-run.cancel' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
