'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::mail-message.mail-message');

const customRoutes = [
  {
    method: 'POST',
    path: '/mail-messages/:documentId/links',
    handler: 'api::mail-message.mail-message.createLink',
  },
  {
    method: 'POST',
    path: '/mail-messages/:documentId/links/:linkDocumentId/remove',
    handler: 'api::mail-message.mail-message.removeLink',
  },
  {
    method: 'POST',
    path: '/mail-messages/:documentId/assign',
    handler: 'api::mail-message.mail-message.assignMessage',
  },
  {
    method: 'POST',
    path: '/mail-messages/:documentId/triage-status',
    handler: 'api::mail-message.mail-message.setTriageStatus',
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
