'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-education.hr-education');

const customRoutes = [
  { method: 'GET',    path: '/hr-educations/mine',             handler: 'api::hr-education.hr-education.myList' },
  { method: 'POST',   path: '/hr-educations/mine',             handler: 'api::hr-education.hr-education.myCreate' },
  { method: 'PUT',    path: '/hr-educations/mine/:documentId', handler: 'api::hr-education.hr-education.myUpdate' },
  { method: 'DELETE', path: '/hr-educations/mine/:documentId', handler: 'api::hr-education.hr-education.myDelete' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
