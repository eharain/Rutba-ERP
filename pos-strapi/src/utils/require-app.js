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
 *   if (!requireApp(ctx, 'web')) return;     // 404 already sent
 *   ... continue handling ...
 */
function requireApp(ctx, expected) {
  const raw = ctx?.request?.headers?.['x-rutba-app'];
  const got = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (got === String(expected).toLowerCase()) return true;
  ctx.notFound();
  return false;
}

module.exports = { requireApp };
