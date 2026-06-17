'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::pay-payslip.pay-payslip');

// Literal path (`my-payslips`) must precede the core `/:id` route.
const customRoutes = [
  { method: 'GET',  path: '/pay-payslips/my-payslips',           handler: 'api::pay-payslip.pay-payslip.myPayslips' },
  { method: 'POST', path: '/pay-payslips/:documentId/mark-paid', handler: 'api::pay-payslip.pay-payslip.markPaid' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
