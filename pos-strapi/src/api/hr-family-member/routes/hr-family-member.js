'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-family-member.hr-family-member');

const customRoutes = [
  { method: 'GET',    path: '/hr-family-members/mine',             handler: 'api::hr-family-member.hr-family-member.myList' },
  { method: 'POST',   path: '/hr-family-members/mine',             handler: 'api::hr-family-member.hr-family-member.myCreate' },
  { method: 'PUT',    path: '/hr-family-members/mine/:documentId', handler: 'api::hr-family-member.hr-family-member.myUpdate' },
  { method: 'DELETE', path: '/hr-family-members/mine/:documentId', handler: 'api::hr-family-member.hr-family-member.myDelete' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
