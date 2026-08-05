'use strict';

/**
 * CORS — the browser-facing half of the wire contract.
 *
 * Every app is its own origin (:4000–:4018) calling the API on another one, so
 * without this the browser never delivers a single response: the preflight for
 * POST /api/auth/local comes back 200 with no Access-Control-Allow-Origin and
 * Firefox reports "CORS Missing Allow Origin". Server-to-server callers never
 * send an Origin header, which is why the smokes and contract-diff — all of
 * them node-side — stayed green while login was broken in a real browser.
 *
 * Parity with pos-strapi (config/middlewares.js → strapi::cors):
 *   - the same @koa/cors that @strapi/core wraps, loaded out of pos-strapi
 *   - matchOrigin ported verbatim from @strapi/core/dist/middlewares/cors.js
 *   - the same allowlist, header list, methods, credentials and max-age
 *
 * Origin allowlist: pos-strapi receives CORS_ORIGINS ready-made because
 * scripts/js/load-env.js computes it and spawns the process with it. rutba-core
 * starts directly, so it computes the same list the same way — every URL-valued
 * variable in the active .env file, minus its own origin, with localhost and
 * 127.0.0.1 treated as interchangeable. An explicit CORS_ORIGINS (docker, prod)
 * always wins.
 */

const path = require('path');
const { loadVars, get } = require('../config/env');

const POS_ROOT = path.join(__dirname, '..', '..', '..', 'pos-strapi');
const koaCors = require(path.join(POS_ROOT, 'node_modules', '@koa', 'cors'));

// Same list pos-strapi allows. The apps send X-Rutba-App and X-Rutba-App-Role
// on every request; a header missing here fails the preflight, not the request,
// so the symptom is an opaque CORS error rather than a 4xx.
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Rutba-App',
  'X-Rutba-App-Role',
  'X-Rutba-App-Admin',
  'Origin',
  'Accept',
];
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/** Verbatim from @strapi/core/dist/middlewares/cors.js. */
const matchOrigin = async (requestOrigin, configuredOrigin, ctx) => {
  if (!requestOrigin) return '*';
  let originList;
  if (typeof configuredOrigin === 'function') originList = await configuredOrigin(ctx);
  else originList = configuredOrigin;

  let normalizedOrigins;
  if (Array.isArray(originList)) normalizedOrigins = originList;
  else if (originList === undefined || originList === null) normalizedOrigins = ['*'];
  else normalizedOrigins = originList.split(',').map((origin) => origin.trim());

  if (normalizedOrigins.includes('*')) return requestOrigin;
  return normalizedOrigins.includes(requestOrigin) ? requestOrigin : '';
};

/**
 * Mirrors buildEnvForApp()'s CORS_ORIGINS step in scripts/js/env-utils.js.
 * Only file-declared variables are scanned — process.env holds plenty of
 * values that parse as URLs (Windows paths parse as a `c:` scheme) and would
 * otherwise widen the allowlist with junk.
 */
function computeOrigins() {
  const explicit = get('CORS_ORIGINS', '');
  if (explicit) {
    return String(explicit).split(',').map((s) => s.trim()).filter(Boolean);
  }

  const { fileVars } = loadVars();
  const found = new Set();
  for (const value of Object.values(fileVars)) {
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') found.add(url.origin);
    } catch { /* not a URL */ }
  }

  const port = get('PORT', '4020');
  for (const own of [`http://localhost:${port}`, `http://127.0.0.1:${port}`]) found.delete(own);

  // localhost and 127.0.0.1 are the same server but different origins to the
  // browser; the apps are reachable as either in dev.
  for (const origin of [...found]) {
    try {
      const u = new URL(origin);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        const alt = new URL(origin);
        alt.hostname = u.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
        found.add(alt.origin);
      }
    } catch { /* ignore */ }
  }
  return [...found];
}

function createCorsMiddleware() {
  const origins = computeOrigins();
  if (origins.length === 0) {
    // Every browser app is cross-origin in production (api.rutba.pk vs
    // auth.rutba.pk, my.rutba.pk, …), and the container image carries no .env
    // files, so an unset CORS_ORIGINS means nothing can reach the API from a
    // browser at all. That fails as an opaque CORS error with a 200 in the
    // access log, so say it loudly at boot instead.
    console.warn('[core] WARNING: CORS allowlist is empty — set CORS_ORIGINS. '
      + 'Every browser request will fail its preflight.');
  }
  const middleware = koaCors({
    async origin(ctx) {
      return matchOrigin(ctx.get('Origin'), origins, ctx);
    },
    maxAge: 31536000,
    credentials: true,
    allowMethods: ALLOWED_METHODS,
    allowHeaders: ALLOWED_HEADERS,
    keepHeadersOnError: false,
  });
  return { middleware, origins };
}

module.exports = { createCorsMiddleware, computeOrigins, matchOrigin, ALLOWED_HEADERS };
