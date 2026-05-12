'use strict';

// Play / dry-run service for the admin's "Play as role" button.
//
// Given (interfaceKey, methodName, roleKey) and optional path/query/body
// inputs, this:
//   1. Loads the api-method-policy for that triple.
//   2. Builds a $-token context using either the current admin user or a
//      caller-specified "actAsUserId" (so admins can preview what a specific
//      user would see — e.g. a branch manager whose branch.id=2).
//   3. Resolves the four template fields against the context.
//   4. For find/findOne actions on UIDs that map to a real content-type,
//      actually runs the resolved query via strapi.documents() and returns
//      the rows. Mutation actions (create/update/delete) are NOT executed
//      from here — they only return the resolved templates so an admin
//      can preview the body/filter Strapi would receive without side effects.
//
// All of this is intended for plugin-admin usage only; routes are admin-type
// so Strapi enforces admin session auth on the endpoint.

const resolver = require('./policy-resolver');

const METHOD_UID = 'plugin::api-pro.api-interface-method';
const POLICY_UID = 'plugin::api-pro.api-method-policy';
const USER_UID = 'plugin::users-permissions.user';

const SAFE_FIND_ACTIONS = new Set(['find', 'findOne']);

async function loadMethod(strapi, interfaceKey, methodName) {
  const method = await strapi.db.query(METHOD_UID).findOne({
    where: { key: `${interfaceKey}:${methodName}` },
    populate: { apiInterface: true },
  });
  if (!method) {
    const err = new Error(`method '${interfaceKey}:${methodName}' not found`);
    err.status = 404;
    throw err;
  }
  return method;
}

async function loadPolicy(strapi, methodId, roleKey) {
  return strapi.db.query(POLICY_UID).findOne({
    where: { interfaceMethod: { id: methodId }, roleKey: String(roleKey).toLowerCase() },
  });
}

async function loadActAsUser(strapi, userId) {
  if (!userId) return null;
  return strapi.db.query(USER_UID).findOne({
    where: { id: Number(userId) },
    populate: { role: true, app_roles: { populate: { appDomains: true } } },
  });
}

function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function mergeQuery(base, fragment) {
  const out = { ...(isPlainObject(base) ? base : {}) };
  if (!isPlainObject(fragment)) return out;
  if (isPlainObject(fragment.filters)) {
    out.filters = isPlainObject(out.filters)
      ? { ...out.filters, ...fragment.filters }
      : fragment.filters;
  }
  if (isPlainObject(fragment.populate) && Object.keys(fragment.populate).length > 0) {
    out.populate = fragment.populate;
  } else if (fragment.populate === '*') {
    out.populate = '*';
  }
  return out;
}

async function play(strapi, params) {
  const {
    interfaceKey,
    methodName,
    roleKey,
    actAsUserId = null,
    pathParams = {},
    queryParams = {},
    bodyData = {},
    documentId = null,
  } = params || {};

  if (!interfaceKey || !methodName || !roleKey) {
    const err = new Error('interfaceKey, methodName and roleKey are required');
    err.status = 400;
    throw err;
  }

  const method = await loadMethod(strapi, interfaceKey, methodName);
  const policy = await loadPolicy(strapi, method.id, roleKey);

  const uid = method.apiInterface?.uid || null;
  const action = method.action || methodName;

  // Resolve token context. The acting user comes from actAsUserId if set,
  // otherwise from the admin running the play.
  let user = null;
  if (actAsUserId) {
    user = await loadActAsUser(strapi, actAsUserId);
    if (!user) {
      const err = new Error(`actAsUserId=${actAsUserId} not found`);
      err.status = 404;
      throw err;
    }
  }

  const tokenCtx = {
    user: user
      ? { id: user.id, email: user.email, username: user.username, ...user }
      : { id: null, email: null, username: 'admin-preview' },
    claim: {
      appName: '(play-preview)',
      roleKey: String(roleKey).toLowerCase(),
      domainKey: null,
    },
    query: queryParams || {},
    params: { ...(pathParams || {}), ...(documentId ? { documentId } : {}) },
    body: bodyData || {},
    strapi: {
      request: { method: String(method.method || 'GET').toUpperCase(), path: method.path },
    },
  };

  const resolved = policy
    ? {
        filters: resolver.resolveDeep(policy.filtersTemplate || {}, tokenCtx),
        populate: resolver.resolveDeep(policy.populateTemplate || {}, tokenCtx),
        body: resolver.resolveDeep(policy.bodyTemplate || {}, tokenCtx),
        query: resolver.resolveDeep(policy.queryTemplate || {}, tokenCtx),
      }
    : { filters: {}, populate: {}, body: {}, query: {} };

  const finalQuery = mergeQuery(
    { ...(queryParams || {}) },
    { filters: resolved.filters, populate: resolved.populate, ...(resolved.query || {}) }
  );

  const result = {
    method: {
      uid,
      action,
      method: method.method,
      path: method.path,
      interfaceKey,
      methodName,
    },
    policyFound: Boolean(policy),
    actAsUser: user
      ? { id: user.id, email: user.email, username: user.username }
      : null,
    tokenContext: {
      // Slim user dump to avoid leaking sensitive fields (e.g. password hash).
      user: user ? { id: user.id, email: user.email, username: user.username } : tokenCtx.user,
      claim: tokenCtx.claim,
      query: tokenCtx.query,
      params: tokenCtx.params,
      body: tokenCtx.body,
    },
    resolved,
    finalQuery,
    response: null,
    executed: false,
    executionError: null,
  };

  // Actually run the query for safe (read-only) actions when we have a valid UID.
  if (uid && SAFE_FIND_ACTIONS.has(action)) {
    try {
      if (action === 'findOne') {
        const target = documentId || pathParams?.documentId || pathParams?.id || null;
        if (!target) {
          result.executionError = 'findOne requires a documentId (or id) in path params to execute';
        } else {
          const doc = await strapi.documents(uid).findOne({
            documentId: String(target),
            ...(finalQuery.populate ? { populate: finalQuery.populate } : {}),
            ...(finalQuery.filters ? { filters: finalQuery.filters } : {}),
          });
          result.response = doc;
          result.executed = true;
        }
      } else {
        const docs = await strapi.documents(uid).findMany({
          ...(finalQuery.filters ? { filters: finalQuery.filters } : {}),
          ...(finalQuery.populate ? { populate: finalQuery.populate } : {}),
          ...(finalQuery.pagination ? { pagination: finalQuery.pagination } : { pagination: { pageSize: 10 } }),
          ...(finalQuery.sort ? { sort: finalQuery.sort } : {}),
          ...(finalQuery.fields ? { fields: finalQuery.fields } : {}),
        });
        result.response = docs;
        result.executed = true;
      }
    } catch (error) {
      result.executionError = error?.message || String(error);
    }
  }

  return result;
}

module.exports = {
  play,
};
