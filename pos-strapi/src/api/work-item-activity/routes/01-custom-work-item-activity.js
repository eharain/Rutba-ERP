'use strict';

/**
 * Custom routes. Registered before the core routes so the literal /assign path
 * isn't shadowed by /:id (koa-router is first-match).
 */
module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/work-item-activities/assign',
      handler: 'work-item-activity.assign',
      // auth:false + manual ensureUser, same pattern as the transition routes.
      config: { auth: false },
    },
  ],
};
