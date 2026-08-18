'use strict';

/**
 * Guard for storefront-facing public routes (auth: false but app-scoped).
 *
 * These endpoints are technically public — no JWT — but they still belong to
 * a specific app surface (the storefront). Random scrapers hitting the URL
 * directly should not get the same response the app does. We assert the
 * X-Rutba-App header matches an expected app name and return 404 otherwise
 * so the endpoint isn't enumerable.
 *
 * Usage:
 *   if (!requireApp(ctx, 'storefront')) return;     // 404 already sent
 *   ... continue handling ...
 */
function requireApp(ctx, expected) {
  if (isApp(ctx, expected)) return true;
  ctx.notFound();
  return false;
}

/**
 * Same header test without the 404 — for shared endpoints that stay open to
 * every app but shape their response differently for one of them.
 */
function isApp(ctx, expected) {
  const raw = ctx?.request?.headers?.['x-rutba-app'];
  const got = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return got === String(expected).toLowerCase();
}

module.exports = { requireApp, isApp };
