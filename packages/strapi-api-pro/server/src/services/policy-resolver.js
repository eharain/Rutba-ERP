'use strict';

const TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const ALLOWED_ROOTS = new Set(['strapi', 'user', 'claim', 'input']);

function getByPath(source, dottedPath) {
  return dottedPath.split('.').reduce((acc, segment) => {
    if (acc == null) return undefined;
    if (typeof acc !== 'object') return undefined;
    return acc[segment];
  }, source);
}

function resolveToken(context, token, strict) {
  const [root] = token.split('.');
  if (!ALLOWED_ROOTS.has(root)) {
    throw new Error(`Policy template token root '${root}' is not allowed`);
  }

  const value = getByPath(context, token);
  if (value === undefined && strict) {
    throw new Error(`Policy template token '${token}' resolved to undefined`);
  }

  return value;
}

function resolveStringTemplate(value, context, strict) {
  const matches = [...value.matchAll(TOKEN_REGEX)];
  if (matches.length === 0) return value;

  if (matches.length === 1 && matches[0][0] === value.trim()) {
    const token = matches[0][1];
    const tokenValue = resolveToken(context, token, strict);
    return tokenValue === undefined ? null : tokenValue;
  }

  return value.replace(TOKEN_REGEX, (_, token) => {
    const tokenValue = resolveToken(context, token, strict);
    if (tokenValue == null) return '';
    if (typeof tokenValue === 'object') return JSON.stringify(tokenValue);
    return String(tokenValue);
  });
}

function resolveNode(node, context, strict) {
  if (Array.isArray(node)) {
    return node.map((item) => resolveNode(item, context, strict));
  }

  if (node && typeof node === 'object') {
    const output = {};
    for (const [key, value] of Object.entries(node)) {
      output[key] = resolveNode(value, context, strict);
    }
    return output;
  }

  if (typeof node === 'string') {
    return resolveStringTemplate(node, context, strict);
  }

  return node;
}

function buildContextBundle({ strapiCtx = {}, user = {}, claim = {}, input = {} } = {}) {
  return {
    strapi: {
      request: {
        method: strapiCtx?.request?.method || null,
        path: strapiCtx?.request?.path || null,
        query: strapiCtx?.request?.query || {},
      },
    },
    user: {
      id: user?.id || null,
      email: user?.email || null,
      username: user?.username || null,
    },
    claim: {
      appName: claim?.appName || null,
      roleKey: claim?.roleKey || null,
      domainKey: claim?.domainKey || null,
    },
    input: input || {},
  };
}

function resolvePolicyTemplates(policy = {}, options = {}) {
  const strict = options.resolverMode !== 'lenient';
  const context = buildContextBundle(options);

  return {
    filters: resolveNode(policy.filtersTemplate || {}, context, strict),
    populate: resolveNode(policy.populateTemplate || {}, context, strict),
    body: resolveNode(policy.bodyTemplate || {}, context, strict),
    query: resolveNode(policy.queryTemplate || {}, context, strict),
  };
}

module.exports = {
  buildContextBundle,
  resolvePolicyTemplates,
};
