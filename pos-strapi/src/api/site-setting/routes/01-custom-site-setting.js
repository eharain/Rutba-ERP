'use strict';

module.exports = {
  routes: [
    {
      // Anonymous read of the singleType. The storefront fetches this on
      // every render via an unauth client (X-Rutba-App: web, no JWT). The
      // default core route at the same path requires UP find on api::site-
      // setting for the public role — which we deliberately don't grant
      // (api-pro is meant to be the sole gatekeeper for the role surface).
      // Registering this with `auth: false` and the alphabetically-first
      // route file makes our handler win the koa-router match.
      method: 'GET',
      path: '/site-setting',
      handler: 'site-setting.find',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/site-setting/publish',
      handler: 'site-setting.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/site-setting/unpublish',
      handler: 'site-setting.unpublish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/site-setting/discard',
      handler: 'site-setting.discardDraft',
      config: { auth: false },
    },
  ],
};
