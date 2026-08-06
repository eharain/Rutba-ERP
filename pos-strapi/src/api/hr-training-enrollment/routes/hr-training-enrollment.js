'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-training-enrollment.hr-training-enrollment');

// Custom routes must precede the core router so literal paths (/mine, /team)
// are not swallowed by the core /:documentId matcher.
const customRoutes = [
  { method: 'GET', path: '/hr-training-enrollments/mine', handler: 'api::hr-training-enrollment.hr-training-enrollment.myTrainings' },
  { method: 'POST', path: '/hr-training-enrollments/enroll', handler: 'api::hr-training-enrollment.hr-training-enrollment.enrollMe' },
  { method: 'POST', path: '/hr-training-enrollments/:documentId/complete', handler: 'api::hr-training-enrollment.hr-training-enrollment.markComplete' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
