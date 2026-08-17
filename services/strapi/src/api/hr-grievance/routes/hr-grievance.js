'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-grievance.hr-grievance');

// Custom routes must precede the core router so literal paths (/mine, /team)
// are not swallowed by the core /:documentId matcher.
const customRoutes = [
  { method: 'GET', path: '/hr-grievances/mine', handler: 'api::hr-grievance.hr-grievance.myGrievances' },
  { method: 'POST', path: '/hr-grievances/submit', handler: 'api::hr-grievance.hr-grievance.submitGrievance' },
  { method: 'GET', path: '/hr-grievances/queue', handler: 'api::hr-grievance.hr-grievance.grievanceQueue' },
  { method: 'POST', path: '/hr-grievances/:documentId/resolve', handler: 'api::hr-grievance.hr-grievance.resolveGrievance' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
