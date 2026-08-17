'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-generated-document.hr-generated-document');

// Custom routes must precede the core router so literal paths (/mine, /team)
// are not swallowed by the core /:documentId matcher.
const customRoutes = [
  { method: 'GET', path: '/hr-generated-documents/mine', handler: 'api::hr-generated-document.hr-generated-document.myDocuments' },
  { method: 'POST', path: '/hr-generated-documents/generate', handler: 'api::hr-generated-document.hr-generated-document.generateDocument' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
