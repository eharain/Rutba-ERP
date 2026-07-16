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
    // Full-catalog push (create/update products + variants + media on Rutba
    // targets). Heavier than the price/stock inventory push, so it runs less
    // often; the inventory job keeps price+stock fresh in between.
    catalogRule: process.env.CRON_CATALOG_RULE || '0 */6 * * *',
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
    // A second Rutba ERP instance treated as a marketplace. Unlike Daraz there is
    // no OAuth: the connection is a Strapi API token + the online instance's API
    // base URL, both stored per-account (api_key + extra_config.base_url). The env
    // values here are only optional fallbacks for a single-target setup/dev.
    rutba: {
      apiUrl: stripSlash(process.env.RUTBA_TARGET_API_URL || ''),
      token: process.env.RUTBA_TARGET_TOKEN || '',
    },
  },
};
