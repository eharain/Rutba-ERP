'use strict';

// Runtime request interceptor.
//
// Claim model: the client explicitly claims (app, role) via headers — the
// server validates the claim against the user's app_roles and uses the
// CLAIMED role's policies (singular) to gate the request. If the user holds
// only one role for the active app, the role header is optional and gets
// auto-selected.
//
// On each non-bypassed request:
//   1. Resolve the claim via services/context.resolveClaim (validates headers
//      against the user's app_roles).
//   2. Parse route → { contentTypeUid, actionName }.
//   3. Look up the policy for (contentTypeUid, actionName, claim.roleKey).
//      Single role → at most one policy row matches (composite key
//      `${interfaceKey}:${methodName}:${roleKey}`).
//   4. Honor denyByDefault when no policy matches.
//   5. Honor enforcementMode: 'off' / 'audit' / 'hybrid' / 'enforce'.
//   6. Resolve the policy's filters/populate/body/query templates with
//      $-tokens against the live request context.
//   7. Inject the resolved fragment into ctx.query / ctx.request.body.
//
// No multi-policy merge anymore — the model is "user picks a role, that role's
// policy applies". If unrestricted access is needed, give the user an admin
// role and let them switch to it from the role-selector menu.

const engine = require('./permission-engine');
const resolver = require('./policy-resolver');
const contextSvc = require('./context');

const NON_INJECTABLE_METHODS = new Set(['OPTIONS', 'HEAD']);

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

function injectIntoQuery(ctx, fragment) {
  ctx.query = ctx.query || {};

  if (fragment.filters && Object.keys(fragment.filters).length > 0) {
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

// ── main entry ──────────────────────────────────────────────────────────────
// Returns:
//   { status: 'allowed' | 'denied' | 'audited' | 'skipped', reason?, policies? }
// The middleware decides whether to short-circuit with 403 based on status.
async function process(ctx, strapi) {
  const cfg = strapi.config.get('plugin::api-pro') || {};
  const mode = cfg.enforcementMode || 'hybrid';
  if (mode === 'off') return { status: 'skipped', reason: 'enforcement off' };

  const user = ctx.state?.user;
  if (!user?.id) return { status: 'skipped', reason: 'no authenticated user' };

  const handler = ctx.state?.route?.handler;
  const parsed = engine.parseRouteHandler(handler);
  if (!parsed) return { status: 'skipped', reason: 'unrecognized route handler' };

  // Resolve the claim (validates headers; throws on invalid claim). Lenient
  // mode lets us skip enforcement when the user simply hasn't picked an app
  // yet (e.g. probing endpoints from the admin) — we treat that as 'skipped'
  // rather than fail hard.
  let claim;
  try {
    claim = await contextSvc.resolveClaim(ctx, strapi, {
      requireApp: false,
      requireActiveRole: false,
    });
  } catch (error) {
    return { status: 'skipped', reason: `claim resolve failed: ${error?.code || error?.message}` };
  }

  if (!claim.appName || !claim.roleKey) {
    // No active app or role — nothing to enforce against in this request.
    return { status: 'skipped', reason: 'no active app/role claim' };
  }

  ctx.state.apiProClaim = {
    appName: claim.appName,
    roleKey: claim.roleKey,
    domainKey: claim.domainKey,
    domainKeys: claim.domainKeys,
  };

  const policy = await engine.getPolicyForActionAndRole(strapi, {
    user,
    roleKey: claim.roleKey,
    contentTypeUid: parsed.contentTypeUid,
    actionName: parsed.actionName,
  });

  if (!policy) {
    if (cfg.denyByDefault && (mode === 'enforce' || mode === 'hybrid')) {
      return { status: 'denied', reason: `no policy for role '${claim.roleKey}' on ${parsed.contentTypeUid}.${parsed.actionName}`, policies: 0 };
    }
    return { status: 'allowed', reason: 'no policy / lenient', policies: 0 };
  }

  if (mode === 'audit') {
    return { status: 'audited', policies: 1 };
  }

  const tokenCtx = resolver.buildTokenContext({
    strapiCtx: ctx,
    user,
    claim: ctx.state.apiProClaim,
  });

  const fragment = resolveOnePolicy(policy, tokenCtx);

  injectIntoQuery(ctx, fragment);
  injectIntoBody(ctx, fragment);

  ctx.state.apiProPolicy = fragment;
  return { status: 'allowed', policies: 1 };
}

module.exports = {
  process,
  // exported for tests
  deepMerge,
};
