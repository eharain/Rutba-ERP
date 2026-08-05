'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-skill.hr-skill');

const customRoutes = [
  { method: 'GET',    path: '/hr-skills/mine',             handler: 'api::hr-skill.hr-skill.myList' },
  { method: 'POST',   path: '/hr-skills/mine',             handler: 'api::hr-skill.hr-skill.myCreate' },
  { method: 'PUT',    path: '/hr-skills/mine/:documentId', handler: 'api::hr-skill.hr-skill.myUpdate' },
  { method: 'DELETE', path: '/hr-skills/mine/:documentId', handler: 'api::hr-skill.hr-skill.myDelete' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
