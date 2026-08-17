'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-attendance.hr-attendance');

const customRoutes = [
  {
    method: 'GET',
    path: '/hr-attendances/my-attendance',
    handler: 'api::hr-attendance.hr-attendance.myAttendance',
  },
  {
    method: 'GET',
    path: '/hr-attendances/team-attendance',
    handler: 'api::hr-attendance.hr-attendance.teamAttendance',
  },
];

module.exports = {
  get routes() {
    return [
      ...customRoutes,
      ...defaultRouter.routes,
    ];
  },
};
