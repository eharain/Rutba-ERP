'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-emergency-contact.hr-emergency-contact');

const customRoutes = [
  { method: 'GET',    path: '/hr-emergency-contacts/mine',             handler: 'api::hr-emergency-contact.hr-emergency-contact.myList' },
  { method: 'POST',   path: '/hr-emergency-contacts/mine',             handler: 'api::hr-emergency-contact.hr-emergency-contact.myCreate' },
  { method: 'PUT',    path: '/hr-emergency-contacts/mine/:documentId', handler: 'api::hr-emergency-contact.hr-emergency-contact.myUpdate' },
  { method: 'DELETE', path: '/hr-emergency-contacts/mine/:documentId', handler: 'api::hr-emergency-contact.hr-emergency-contact.myDelete' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
