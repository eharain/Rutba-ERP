'use strict';

const path = require('path');

const API_INTERFACE_UID = 'plugin::api-pro.api-interface';
const API_METHOD_UID = 'plugin::api-pro.api-interface-method';

function extractRouteTokens(routePath) {
  const path = String(routePath || '');
  const colonTokens = path
    .split('/')
    .filter(Boolean)
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1));

  const templateTokens = [];
  const templateRegex = /\$\{\s*([a-zA-Z_$][\w$]*)\s*\}/g;
  let match;
  while ((match = templateRegex.exec(path)) !== null) {
    templateTokens.push(match[1]);
  }

  return [...new Set([...colonTokens, ...templateTokens])];
}

function alignSignature(routePath, signature = []) {
  const tokens = extractRouteTokens(routePath);
  const mismatches = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const expected = tokens[i];
    const actual = String(signature[i] || '').trim();
    if (!actual || actual !== expected) {
      mismatches.push({ index: i, expected, actual: actual || null });
    }
  }

  return {
    tokens,
    signature,
    mismatches,
    aligned: mismatches.length === 0,
  };
}

function deriveFilePath(key) {
  const safe = String(key || 'interface').toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  return `api/${safe}.js`;
}

async function listInterfaces(strapi) {
  return await strapi.db.query(API_INTERFACE_UID).findMany({
    populate: {
      methods: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

async function createFromRecordings(strapi, payload = {}) {
  const key = payload.key || payload.name;
  if (!key) {
    throw new Error('key or name is required');
  }

  const created = await strapi.db.query(API_INTERFACE_UID).create({
    data: {
      key,
      name: payload.name || key,
      filePath: payload.filePath || deriveFilePath(key),
      uid: payload.uid || null,
      status: 'generated',
    },
  });

  return created;
}

async function createFromContentType(strapi, payload = {}) {
  const uid = String(payload.uid || '').trim();
  if (!uid) {
    throw new Error('content type uid is required');
  }

  const key = uid.split('.').pop() || uid;

  return await strapi.db.query(API_INTERFACE_UID).create({
    data: {
      key,
      name: payload.name || key,
      filePath: payload.filePath || deriveFilePath(key),
      uid,
      status: 'generated',
    },
  });
}

async function upsertMethod(strapi, interfaceId, payload = {}) {
  const methodName = String(payload.name || '').trim();
  const routePath = String(payload.path || '').trim();
  const method = String(payload.method || '').toLowerCase();

  if (!methodName || !routePath || !method) {
    throw new Error('name, path and method are required');
  }

  const signature = Array.isArray(payload.inputSignature) ? payload.inputSignature : [];
  const alignment = alignSignature(routePath, signature);
  const guidedFix = Boolean(payload.guidedFix);

  if (!alignment.aligned && payload.strictAlignment !== false && !guidedFix) {
    const detail = alignment.mismatches
      .map((m) => `index ${m.index}: expected '${m.expected}' got '${m.actual || '<empty>'}'`)
      .join('; ');
    const err = new Error(`Route parameter mismatch: ${detail}`);
    err.code = 'ROUTE_PARAM_MISMATCH';
    err.details = alignment;
    throw err;
  }

  const existing = await strapi.db.query(API_METHOD_UID).findOne({
    where: {
      apiInterface: interfaceId,
      name: methodName,
    },
  });

  const data = {
    key: `${interfaceId}:${methodName}`,
    name: methodName,
    action: payload.action || null,
    method,
    path: routePath,
    routeTokens: alignment.tokens,
    inputSignature: alignment.aligned ? signature : (guidedFix ? alignment.tokens : signature),
    apps: payload.apps || [],
    appRoles: payload.appRoles || [],
    apiInterface: interfaceId,
  };

  if (existing) {
    return await strapi.db.query(API_METHOD_UID).update({
      where: { id: existing.id },
      data,
    });
  }

  return await strapi.db.query(API_METHOD_UID).create({ data });
}

function previewAlignment(routePath, signature = []) {
  const alignment = alignSignature(routePath, signature);
  return {
    ...alignment,
    suggestedSignature: alignment.tokens,
  };
}

function resolveApiProviderPaths(strapi) {
  const pluginConfig = strapi.config.get('plugin::api-pro') || {};
  const root = path.resolve(process.cwd(), pluginConfig.apiProviderRoot || '../../api-provider');
  return {
    root,
    interfacesDir: path.join(root, pluginConfig.interfacesDir || 'api'),
  };
}

module.exports = {
  extractRouteTokens,
  alignSignature,
  listInterfaces,
  createFromRecordings,
  createFromContentType,
  upsertMethod,
  previewAlignment,
  resolveApiProviderPaths,
};
