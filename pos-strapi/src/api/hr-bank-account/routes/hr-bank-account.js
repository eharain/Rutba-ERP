'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-bank-account.hr-bank-account');

const customRoutes = [
  { method: 'GET',    path: '/hr-bank-accounts/mine',             handler: 'api::hr-bank-account.hr-bank-account.myList' },
  { method: 'POST',   path: '/hr-bank-accounts/mine',             handler: 'api::hr-bank-account.hr-bank-account.myCreate' },
  { method: 'PUT',    path: '/hr-bank-accounts/mine/:documentId', handler: 'api::hr-bank-account.hr-bank-account.myUpdate' },
  { method: 'DELETE', path: '/hr-bank-accounts/mine/:documentId', handler: 'api::hr-bank-account.hr-bank-account.myDelete' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
