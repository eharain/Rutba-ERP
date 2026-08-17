'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-goal.hr-goal');

// Custom routes must precede the core router so literal paths (/mine, /team)
// are not swallowed by the core /:documentId matcher.
const customRoutes = [
  { method: 'GET', path: '/hr-goals/mine', handler: 'api::hr-goal.hr-goal.myGoals' },
  { method: 'PUT', path: '/hr-goals/mine/:documentId', handler: 'api::hr-goal.hr-goal.updateMyGoal' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
