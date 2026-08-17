'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-certification.hr-certification');

const customRoutes = [
  { method: 'GET',    path: '/hr-certifications/mine',             handler: 'api::hr-certification.hr-certification.myList' },
  { method: 'POST',   path: '/hr-certifications/mine',             handler: 'api::hr-certification.hr-certification.myCreate' },
  { method: 'PUT',    path: '/hr-certifications/mine/:documentId', handler: 'api::hr-certification.hr-certification.myUpdate' },
  { method: 'DELETE', path: '/hr-certifications/mine/:documentId', handler: 'api::hr-certification.hr-certification.myDelete' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
