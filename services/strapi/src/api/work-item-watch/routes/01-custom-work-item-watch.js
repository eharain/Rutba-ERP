'use strict';

/**
 * Custom routes for toggling a watch. Registered before the core routes so the
 * literal /toggle path isn't shadowed by /:id (koa-router is first-match).
 */
module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/work-item-watches/toggle',
      handler: 'work-item-watch.toggle',
      // auth:false + manual ensureUser — same pattern as the transition routes;
      // the api-pro interceptor skips unauthenticated requests, so auth is
      // enforced in the controller.
      config: { auth: false },
    },
  ],
};
