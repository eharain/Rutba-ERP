'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-employee.hr-employee');

// Literal path (`me`) must precede the core `/:id` route.
const customRoutes = [
  { method: 'GET', path: '/hr-employees/me', handler: 'api::hr-employee.hr-employee.myProfile' },
  { method: 'PUT', path: '/hr-employees/me', handler: 'api::hr-employee.hr-employee.updateMyProfile' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
