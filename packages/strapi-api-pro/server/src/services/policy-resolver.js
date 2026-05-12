'use strict';

// Policy template token resolver.
//
// Tokens use $-prefixed syntax, matching AGP. A token IS the full string value —
// they are NOT substrings inside a larger string. So a policy like:
//
//   { "owner": "$user.id", "branch": "$user.branch.id" }
//
// resolves to { "owner": 42, "branch": 7 } given a user with those fields.
//
// Supported roots: $user, $claim, $query, $params, $body, $strapi
// Special scalars: $today (yyyy-mm-dd), $now (full ISO)
//
// See memory: feedback_policy_token_syntax.

const ALLOWED_ROOTS = new Set(['user', 'claim', 'query', 'params', 'body', 'strapi']);

function resolveToken(value, context) {
  if (typeof value !== 'string' || !value.startsWith('$')) return value;

  if (value === '$today') return new Date().toISOString().split('T')[0];
  if (value === '$now') return new Date().toISOString();

  const parts = value.slice(1).split('.');
  if (parts.length === 0) return undefined;

  const [root] = parts;
  if (!ALLOWED_ROOTS.has(root)) return undefined;

  let result = context;
  for (const part of parts) {
    if (result === undefined || result === null) return undefined;
    result = result[part];
  }
  return result;
}

// Recursively walk a plain object / array and resolve any $-token string leaves.
// Used so filter trees like { $or: [{ invoice_no: "$query.q" }] } resolve correctly.
// Undefined tokens are STRIPPED from the result — they do not survive to the
// final filter/body. This matches AGP's behavior.
function resolveDeep(value, context) {
  if (Array.isArray(value)) {
    return value
      .map((v) => resolveDeep(v, context))
      .filter((v) => v !== undefined);
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const resolved = resolveDeep(v, context);
      if (resolved !== undefined) out[k] = resolved;
    }
    return out;
  }
  if (typeof value === 'string' && value.startsWith('$')) {
    return resolveToken(value, context);
  }
  return value;
}

// Build the standard token context bundle from a Koa ctx + an api-pro claim.
// Pulls Strapi v5 body shape ({ data: ... }) out so $body.* points at the
// inner object the caller actually wrote.
function buildTokenContext({ strapiCtx, user = null, claim = null } = {}) {
  return {
    user: user || strapiCtx?.state?.user || null,
    claim: claim || strapiCtx?.state?.apiProClaim || null,
    query: strapiCtx?.query || {},
    params: strapiCtx?.params || {},
    body: strapiCtx?.request?.body?.data || strapiCtx?.request?.body || {},
    strapi: {
      request: {
        method: strapiCtx?.request?.method || null,
        path: strapiCtx?.request?.path || null,
      },
    },
  };
}

// Resolve all four template fields of a stored api-method-policy row.
// Returns plain objects with $-tokens substituted; safe to merge straight into
// ctx.query / ctx.request.body.
function resolvePolicyTemplates(policy = {}, context = {}) {
  return {
    filters: resolveDeep(policy.filtersTemplate || {}, context),
    populate: resolveDeep(policy.populateTemplate || {}, context),
    body: resolveDeep(policy.bodyTemplate || {}, context),
    query: resolveDeep(policy.queryTemplate || {}, context),
  };
}

module.exports = {
  resolveToken,
  resolveDeep,
  buildTokenContext,
  resolvePolicyTemplates,
};
