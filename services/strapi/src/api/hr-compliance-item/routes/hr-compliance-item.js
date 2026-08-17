'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-compliance-item.hr-compliance-item');

// Custom routes must precede the core router so literal paths (/mine, /team)
// are not swallowed by the core /:documentId matcher.
const customRoutes = [
  { method: 'GET', path: '/hr-compliance-items/mine', handler: 'api::hr-compliance-item.hr-compliance-item.myComplianceItems' },
  { method: 'GET', path: '/hr-compliance-items/expiring', handler: 'api::hr-compliance-item.hr-compliance-item.expiringItems' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
