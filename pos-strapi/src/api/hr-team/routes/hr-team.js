'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-team.hr-team');

module.exports = {
  get routes() {
    return [
      {
        method: 'GET',
        path: '/hr-teams/app-role-options',
        handler: 'api::hr-team.hr-team.appRoleOptions',
      },
      ...defaultRouter.routes,
    ];
  },
};
