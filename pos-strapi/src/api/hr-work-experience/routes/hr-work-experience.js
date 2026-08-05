'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-work-experience.hr-work-experience');

const customRoutes = [
  { method: 'GET',    path: '/hr-work-experiences/mine',             handler: 'api::hr-work-experience.hr-work-experience.myList' },
  { method: 'POST',   path: '/hr-work-experiences/mine',             handler: 'api::hr-work-experience.hr-work-experience.myCreate' },
  { method: 'PUT',    path: '/hr-work-experiences/mine/:documentId', handler: 'api::hr-work-experience.hr-work-experience.myUpdate' },
  { method: 'DELETE', path: '/hr-work-experiences/mine/:documentId', handler: 'api::hr-work-experience.hr-work-experience.myDelete' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
