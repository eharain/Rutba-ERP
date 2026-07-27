'use strict';

// `auth: false` bypasses the users-permissions scope check (the custom
// `publish`/`unpublish` actions aren't seeded into the UP `rutba_app_user`
// role, so without this every call 403s before reaching the controller).
// The controller calls `ensureUser` to re-parse the JWT and api-pro's
// interceptor enforces the actual role check.
module.exports = {
  routes: [
    // Literal `for-product` segment must be declared before any `/:id` route —
    // Strapi's router is first-match, so `/sale-offers/:id` would otherwise
    // swallow it. This file loads before the core router (01- prefix).
    {
      method: 'GET',
      path: '/sale-offers/for-product/:documentId',
      handler: 'sale-offer.listOffersForProduct',
      config: { auth: false },
    },
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
