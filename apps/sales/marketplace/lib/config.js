'use strict';

// Server-side engine configuration, read from the app's process env.
//
// load-env.js strips the `MARKETPLACE__` prefix, so the repo-root
// .env entries (MARKETPLACE__DARAZ_APP_KEY, …) arrive here as
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
    // Order-status push-back and the order conversation both face a waiting
    // customer, so they run tighter than catalog/inventory: a delivered parcel
    // still showing "processing", or an unanswered question, is what the
    // customer actually notices.
    fulfillmentRule: process.env.CRON_FULFILLMENT_RULE || '*/10 * * * *',
    messagesRule: process.env.CRON_MESSAGES_RULE || '*/5 * * * *',
    refreshRule: process.env.CRON_REFRESH_RULE || '0 */4 * * *',
  },

  providers: {
    daraz: {
      // App-level credentials (one Daraz app); per-account OAuth tokens live in
      // Strapi and are fetched at runtime.
      appKey: process.env.DARAZ_APP_KEY || '',
      appSecret: process.env.DARAZ_APP_SECRET || '',
      region: (process.env.DARAZ_REGION || 'pk').toLowerCase(),
      // Three separate hosts, because Daraz uses three and they can move
      // independently. Blank = the regional default for that role.
      //   apiHost   — business REST host        (e.g. https://api.daraz.pk/rest)
      //   authUrl   — browser OAuth authorize page
      //   tokenHost — auth gateway the token create/refresh calls POST to.
      //               Defaults to apiHost/region so behaviour is unchanged;
      //               Daraz documents it as a host of its own, so a token
      //               exchange that 404s (or returns a non-zero envelope code
      //               that looks like bad credentials) is corrected here by
      //               config alone. See lib/providers/daraz.js → tokenHost().
      apiHost: process.env.DARAZ_API_HOST || '',
      authUrl: process.env.DARAZ_AUTH_URL || '',
      tokenHost: process.env.DARAZ_TOKEN_HOST || '',
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
