'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-benefit-enrollment.hr-benefit-enrollment');

const customRoutes = [
  { method: 'GET', path: '/hr-benefit-enrollments/mine', handler: 'api::hr-benefit-enrollment.hr-benefit-enrollment.myEnrollments' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
