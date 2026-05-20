'use strict';

// `auth: false` bypasses the users-permissions scope check (the custom
// `publish`/`unpublish` actions aren't seeded into the UP `rutba_app_user`
// role, so without this every call 403s before reaching the controller).
// The controller calls `ensureUser` to re-parse the JWT and api-pro's
// interceptor enforces the actual role check.
module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/sale-offers/:id/publish',
      handler: "sale-offer.publish",
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/sale-offers/:id/unpublish',
      handler: "sale-offer.unpublish",
      config: { auth: false },
    },
  ],
};
