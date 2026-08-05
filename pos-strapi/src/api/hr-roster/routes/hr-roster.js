'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-roster.hr-roster');

const customRoutes = [
  { method: 'GET', path: '/hr-rosters/mine', handler: 'api::hr-roster.hr-roster.myRoster' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
