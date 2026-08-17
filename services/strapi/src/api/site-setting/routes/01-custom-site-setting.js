'use strict';

module.exports = {
  routes: [
    {
      // Anonymous RESOLVER read. The storefront fetches this on every render
      // via an unauth client (X-Rutba-App: web, no JWT). The default core
      // route at the same path requires UP find on api::site-setting for the
      // public role — which we deliberately don't grant (api-pro is meant to
      // be the sole gatekeeper for the role surface). Registering this with
      // `auth: false` and the alphabetically-first route file makes our
      // handler win the koa-router match.
      //
      // Site settings are a collection now (one row per app). This singular
      // path resolves app_slug → is_default → first row, so every existing
      // caller keeps working; the per-row CRUD lives on /site-settings.
      method: 'GET',
      path: '/site-setting',
      handler: 'site-setting.find',
      config: { auth: false },
    },
    // NOTE: there is deliberately no unauthenticated WRITE on the resolver
    // path. Editing goes through the collection routes (/site-settings/:id),
    // which run the normal auth chain. The publish/unpublish/discard routes
    // below predate this change and are auth:false — that is a standing hole
    // worth closing, but it is not widened here.
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
