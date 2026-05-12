'use strict';

// Runtime request interceptor.
//
// On each non-bypassed request:
//   1. Resolve route → { contentTypeUid, actionName }.
//   2. Look up matching policies (cache-backed via permission-engine).
//   3. Honor denyByDefault when no policy matches.
//   4. Honor enforcementMode: 'off' / 'audit' / 'hybrid' / 'enforce'.
//   5. Resolve each policy's filters/populate/fields/body/query templates with
//      $-tokens against the live request context.
//   6. Merge resolved fragments across all matching policies:
//      • filters  → $or-wrap for ≥2 policies (any role grants access)
//      • populate → deep-merge union
//      • fields   → array union (most permissive)
//      • body     → deep-merge (later policy overrides on scalars)
//      • query    → deep-merge
//   7. Inject the merged fragment into ctx.query / ctx.request.body.
//   8. x-rutba-app-admin elevation: skip filter injection (full read) but keep
//      field/body restrictions.

const engine = require('./permission-engine');
const resolver = require('./policy-resolver');

const NON_INJECTABLE_METHODS = new Set(['OPTIONS', 'HEAD']);

// ── merge helpers ───────────────────────────────────────────────────────────
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(target, source) {
  if (!isPlainObject(source)) return source;
  const out = { ...(isPlainObject(target) ? target : {}) };
  for (const [k, v] of Object.entries(source)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else if (Array.isArray(v) && Array.isArray(out[k])) {
      out[k] = Array.from(new Set([...out[k], ...v]));
    } else {
      out[k] = v;
    }
  }
  return out;
}

function unionFields(...lists) {
  const out = new Set();
  for (const list of lists) {
    if (Array.isArray(list)) {
      for (const f of list) if (typeof f === 'string') out.add(f);
    }
  }
  return Array.from(out);
}

// Merge resolved policy fragments across N policies.
function mergeFragments(fragments) {
  if (fragments.length === 0) return null;
  if (fragments.length === 1) return fragments[0];

  const nonEmptyFilters = fragments
    .map((f) => f.filters)
    .filter((x) => isPlainObject(x) && Object.keys(x).length > 0);

  const merged = {
    filters:
      nonEmptyFilters.length === 0 ? {}
      : nonEmptyFilters.length === 1 ? nonEmptyFilters[0]
      : { $or: nonEmptyFilters },
    populate: fragments.reduce((acc, f) => deepMerge(acc, f.populate || {}), {}),
    fields: unionFields(...fragments.map((f) => f.fields)),
    body: fragments.reduce((acc, f) => deepMerge(acc, f.body || {}), {}),
    query: fragments.reduce((acc, f) => deepMerge(acc, f.query || {}), {}),
  };
  return merged;
}

// Convert a stored policy row's templates into a resolved fragment.
// `fields` is treated as a special case: it lives inside `queryTemplate.fields`
// or `populateTemplate.fields` only by convention; for now we read it from a
// top-level `fields` key on the resolved query (since the schema doesn't have
// a separate fieldsTemplate column yet).
function resolveOnePolicy(policy, tokenCtx) {
  const r = resolver.resolvePolicyTemplates(policy, tokenCtx);
  return {
    filters: isPlainObject(r.filters) ? r.filters : {},
    populate: isPlainObject(r.populate) ? r.populate : {},
    body: isPlainObject(r.body) ? r.body : {},
    query: isPlainObject(r.query) ? r.query : {},
    fields: Array.isArray(r.query?.fields) ? r.query.fields : [],
  };
}

// ── injection ───────────────────────────────────────────────────────────────
function injectIntoQuery(ctx, fragment, { skipFilters = false } = {}) {
  ctx.query = ctx.query || {};

  if (!skipFilters && fragment.filters && Object.keys(fragment.filters).length > 0) {
    ctx.query.filters = deepMerge(
      isPlainObject(ctx.query.filters) ? ctx.query.filters : {},
      fragment.filters
    );
  }

  if (fragment.populate && Object.keys(fragment.populate).length > 0) {
    if (!ctx.query.populate) {
      ctx.query.populate = fragment.populate;
    } else if (isPlainObject(ctx.query.populate)) {
      ctx.query.populate = deepMerge(ctx.query.populate, fragment.populate);
    }
  }

  if (fragment.fields && fragment.fields.length > 0) {
    const requested = Array.isArray(ctx.query.fields) ? ctx.query.fields : [];
    ctx.query.fields = requested.length > 0
      ? requested.filter((f) => fragment.fields.includes(f))
      : fragment.fields.slice();
  }

  if (fragment.query && Object.keys(fragment.query).length > 0) {
    for (const [k, v] of Object.entries(fragment.query)) {
      if (k === 'fields' || k === 'filters' || k === 'populate') continue;
      ctx.query[k] = v;
    }
  }
}

function injectIntoBody(ctx, fragment) {
  if (!fragment.body || Object.keys(fragment.body).length === 0) return;
  if (NON_INJECTABLE_METHODS.has((ctx.request?.method || '').toUpperCase())) return;
  if (!ctx.request) return;

  if (isPlainObject(ctx.request.body?.data)) {
    ctx.request.body.data = deepMerge(ctx.request.body.data, fragment.body);
  } else {
    ctx.request.body = deepMerge(isPlainObject(ctx.request.body) ? ctx.request.body : {}, fragment.body);
  }
}

// ── claim helpers ───────────────────────────────────────────────────────────
function readClaim(ctx, strapi) {
  const cfg = strapi.config.get('plugin::api-pro') || {};
  const headerDomainKey = (cfg.headerDomainKey || 'x-rutba-app').toLowerCase();
  const headerElevatedKey = (cfg.headerElevatedKey || 'x-rutba-app-admin').toLowerCase();
  const headers = ctx.request?.headers || {};

  const appName = String(headers[headerDomainKey] || '').trim() || null;
  const elevatedRaw = headers[headerElevatedKey];
  const elevated =
    elevatedRaw === true ||
    elevatedRaw === 'true' ||
    elevatedRaw === '1' ||
    elevatedRaw === 1;

  return { appName, elevated };
}

// ── main entry ──────────────────────────────────────────────────────────────
// Called from the global Koa middleware installed in bootstrap.js.
// Returns:
//   { status: 'allowed' | 'denied' | 'audited' | 'skipped', reason?: string, policies?: number }
// The middleware decides whether to short-circuit with 403 based on this.
async function process(ctx, strapi) {
  const cfg = strapi.config.get('plugin::api-pro') || {};
  const mode = cfg.enforcementMode || 'hybrid';
  if (mode === 'off') return { status: 'skipped', reason: 'enforcement off' };

  const user = ctx.state?.user;
  if (!user?.id) return { status: 'skipped', reason: 'no authenticated user' };

  const handler = ctx.state?.route?.handler;
  const parsed = engine.parseRouteHandler(handler);
  if (!parsed) return { status: 'skipped', reason: 'unrecognized route handler' };

  const policies = await engine.getPoliciesForAction(strapi, {
    user,
    contentTypeUid: parsed.contentTypeUid,
    actionName: parsed.actionName,
  });

  if (policies.length === 0) {
    if (cfg.denyByDefault && (mode === 'enforce' || mode === 'hybrid')) {
      return { status: 'denied', reason: 'no matching policy', policies: 0 };
    }
    return { status: 'allowed', reason: 'no policy / lenient', policies: 0 };
  }

  if (mode === 'audit') {
    return { status: 'audited', policies: policies.length };
  }

  const claim = readClaim(ctx, strapi);
  ctx.state.apiProClaim = { appName: claim.appName, elevated: claim.elevated };

  const tokenCtx = resolver.buildTokenContext({
    strapiCtx: ctx,
    user,
    claim: { appName: claim.appName, elevated: claim.elevated },
  });

  const fragments = policies.map((p) => resolveOnePolicy(p, tokenCtx));
  const merged = mergeFragments(fragments);
  if (!merged) return { status: 'allowed', policies: 0 };

  injectIntoQuery(ctx, merged, { skipFilters: claim.elevated });
  injectIntoBody(ctx, merged);

  ctx.state.apiProPolicy = merged;
  return { status: 'allowed', policies: policies.length };
}

module.exports = {
  process,
  // exported for tests
  mergeFragments,
  deepMerge,
};
