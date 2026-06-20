'use strict';

// Server-side engine configuration, read from the app's process env.
//
// load-env.js strips the `RUTBA_MARKETPLACE__` prefix, so the repo-root
// .env entries (RUTBA_MARKETPLACE__DARAZ_APP_KEY, …) arrive here as
// DARAZ_APP_KEY, STRAPI_SERVICE_TOKEN, etc. None of these are NEXT_PUBLIC_*,
// so they stay server-only (worker + API routes) and never reach the browser.

const stripSlash = (s) => String(s || '').replace(/\/+$/, '');

module.exports = {
  // Public origin Daraz redirects back to for the OAuth callback (the app's
  // own /api/oauth/callback route). MUST be https + publicly reachable in prod.
  publicUrl: stripSlash(process.env.PUBLIC_URL || 'http://localhost:4016'),

  // How the engine reaches Strapi (server-to-server, via an API token — api-pro
  // skips token requests since there's no authenticated user).
  strapi: {
    apiUrl: stripSlash(process.env.STRAPI_API_URL || 'http://127.0.0.1:4010/api'),
    token: process.env.STRAPI_SERVICE_TOKEN || '',
  },

  // Built-in worker (instrumentation.js). Disable per-instance to avoid
  // duplicate pulls/pushes when running more than one app replica.
  worker: {
    enabled: process.env.WORKER_ENABLED !== 'false',
    // Job runner backend. 'inproc' = this worker's interval scheduler. Swap for
    // 'bullmq' / 'pubsub' (lib/jobs.js) once volume warrants a broker.
    backend: process.env.JOBS_BACKEND || 'inproc',
    ordersRule: process.env.CRON_ORDERS_RULE || '*/15 * * * *',
    inventoryRule: process.env.CRON_INVENTORY_RULE || '*/60 * * * *',
    refreshRule: process.env.CRON_REFRESH_RULE || '0 */4 * * *',
  },

  providers: {
    daraz: {
      // App-level credentials (one Daraz app); per-account OAuth tokens live in
      // Strapi and are fetched at runtime.
      appKey: process.env.DARAZ_APP_KEY || '',
      appSecret: process.env.DARAZ_APP_SECRET || '',
      region: (process.env.DARAZ_REGION || 'pk').toLowerCase(),
      apiHost: process.env.DARAZ_API_HOST || '',
      authUrl: process.env.DARAZ_AUTH_URL || '',
    },
  },
};
