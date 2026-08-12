'use strict';

// Custom social-relay-provider routes. `auth: false` + ensureUser/requireAppAdmin
// in the handlers (same pattern as social-account) — custom action names would
// otherwise 403 under Strapi's scope check.
//
// The literal `/meta` route is declared before the core `/:id` GET so the
// first-match koa-router can't treat "meta" as an :id.

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/social-relay-providers/meta',
      handler: 'social-relay-provider.meta',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/social-relay-providers/:id/validate',
      handler: 'social-relay-provider.validate',
      config: { auth: false },
    },
  ],
};
