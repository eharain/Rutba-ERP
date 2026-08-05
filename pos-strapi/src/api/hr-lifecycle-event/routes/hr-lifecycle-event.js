'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-lifecycle-event.hr-lifecycle-event');

const customRoutes = [
  { method: 'GET', path: '/hr-lifecycle-events/mine', handler: 'api::hr-lifecycle-event.hr-lifecycle-event.myTimeline' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
