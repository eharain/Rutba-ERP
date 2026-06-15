'use strict';

// Custom social-account routes. The authd actions use `auth: false` + ensureUser
// (same pattern as social-post). The OAuth callback is genuinely public — it is
// the redirect target the provider sends the browser back to — so it skips
// ensureUser and returns an HTML popup-closer.
//
// The literal `/oauth/callback` route is declared before the `/:id/...` routes so
// the first-match koa-router can't shadow it.

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/social-accounts/oauth/callback',
      handler: 'social-account.oauthCallback',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/social-accounts/:id/connect-url',
      handler: 'social-account.getConnectUrl',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/social-accounts/:id/validate-connection',
      handler: 'social-account.validateConnection',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/social-accounts/:id/refresh-token',
      handler: 'social-account.syncToken',
      config: { auth: false },
    },
  ],
};
