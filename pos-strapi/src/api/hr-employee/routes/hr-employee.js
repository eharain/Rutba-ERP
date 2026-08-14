'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-employee.hr-employee');

// Literal path (`me`) must precede the core `/:id` route.
const customRoutes = [
  { method: 'GET', path: '/hr-employees/me', handler: 'api::hr-employee.hr-employee.myProfile' },
  { method: 'PUT', path: '/hr-employees/me', handler: 'api::hr-employee.hr-employee.updateMyProfile' },
  { method: 'GET', path: '/hr-employees/dashboard', handler: 'api::hr-employee.hr-employee.dashboard' },
  { method: 'GET', path: '/hr-employees/org-chart', handler: 'api::hr-employee.hr-employee.orgChart' },
  { method: 'GET', path: '/hr-employees/without-reporting-line', handler: 'api::hr-employee.hr-employee.withoutReportingLine' },
  { method: 'POST', path: '/hr-employees/backfill-reporting-line', handler: 'api::hr-employee.hr-employee.backfillReportingLine' },
  // Two segments, so it cannot be shadowed by the core `/hr-employees/:id`.
  { method: 'PUT', path: '/hr-employees/:id/reporting-line', handler: 'api::hr-employee.hr-employee.setReportingLine' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
