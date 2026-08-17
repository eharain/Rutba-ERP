'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-incident-report.hr-incident-report');

// Custom routes must precede the core router so literal paths (/mine, /team)
// are not swallowed by the core /:documentId matcher.
const customRoutes = [
  { method: 'POST', path: '/hr-incident-reports/report', handler: 'api::hr-incident-report.hr-incident-report.reportIncident' },
  { method: 'GET', path: '/hr-incident-reports/mine', handler: 'api::hr-incident-report.hr-incident-report.myIncidents' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
