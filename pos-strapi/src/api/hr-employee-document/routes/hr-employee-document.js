'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-employee-document.hr-employee-document');

const customRoutes = [
  { method: 'GET',    path: '/hr-employee-documents/mine',             handler: 'api::hr-employee-document.hr-employee-document.myList' },
  { method: 'POST',   path: '/hr-employee-documents/mine',             handler: 'api::hr-employee-document.hr-employee-document.myCreate' },
  { method: 'PUT',    path: '/hr-employee-documents/mine/:documentId', handler: 'api::hr-employee-document.hr-employee-document.myUpdate' },
  { method: 'DELETE', path: '/hr-employee-documents/mine/:documentId', handler: 'api::hr-employee-document.hr-employee-document.myDelete' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
