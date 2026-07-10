'use strict';

/**
 * Custom production-template routes.
 *
 * `instantiate` is auth:false (like the WO transition route) so Strapi doesn't
 * reject the custom action name; auth is enforced in the controller via
 * ensureUser. This also keeps it out of the api-pro interceptor's path — the
 * descriptor still advertises apps/approle for the frontend client.
 */
module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/mfg-production-templates/:documentId/instantiate',
      handler: 'instantiate.instantiate',
      config: {
        auth: false,
      },
    },
  ],
};
