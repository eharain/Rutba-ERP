'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::pay-bonus.pay-bonus');

const customRoutes = [
  { method: 'GET', path: '/pay-bonuses/mine', handler: 'api::pay-bonus.pay-bonus.myBonuses' },
  { method: 'GET', path: '/pay-bonuses/team', handler: 'api::pay-bonus.pay-bonus.teamBonuses' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
