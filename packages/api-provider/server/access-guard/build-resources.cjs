// @ts-nocheck
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

/**
 * @param {any} value
 * @returns {any[]}
 */
function toArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {any} values
 * @returns {string[]}
 */
function uniqueStrings(values) {
  return [...new Set(toArray(values).filter((v) => typeof v === 'string' && v.trim()))];
}

/**
 * @param {any} method
 * @param {any} endpointPath
 * @param {any} methodName
 * @returns {string | null}
 */
function inferAction(method, endpointPath, methodName) {
  const normalizedMethod = String(method || '').toLowerCase();
  const normalizedPath = String(endpointPath || '');
  const normalizedName = String(methodName || '').toLowerCase();

  if (normalizedName.includes('publish')) {
    return normalizedName.includes('unpublish') ? 'unpublish' : 'publish';
  }
  if (normalizedName.includes('delete') || normalizedName === 'del') return 'delete';
  if (normalizedName.includes('update') || normalizedName.startsWith('put')) return 'update';
  if (normalizedName.includes('create') || normalizedName.startsWith('post')) return 'create';
  if (normalizedName.includes('byid') || normalizedName.includes('findone')) return 'findOne';
  if (normalizedName.includes('list') || normalizedName.includes('search') || normalizedName.includes('find')) {
    return 'find';
  }

  if (normalizedMethod === 'post') return 'create';
  if (normalizedMethod === 'put' || normalizedMethod === 'patch') return 'update';
  if (normalizedMethod === 'delete') return 'delete';
  if (normalizedMethod === 'get') {
    return /\/[^/]+\/[:$]|\/\$\{/.test(normalizedPath) ? 'findOne' : 'find';
  }

  return null;
}

/**
 * @param {any} strapi
 * @returns {Map<string, string>}
 */
function buildContentTypeLookup(strapi) {
  const lookup = new Map();

  for (const [uid, model] of Object.entries(strapi?.contentTypes || {})) {
    if (!uid.startsWith('api::')) continue;

    const singularName = String(model?.info?.singularName || '').toLowerCase();
    const pluralName = String(model?.info?.pluralName || '').toLowerCase();
    const modelName = String(uid.split('.').pop() || '').toLowerCase();

    if (singularName) lookup.set(singularName, uid);
    if (pluralName) lookup.set(pluralName, uid);
    if (modelName) lookup.set(modelName, uid);
    if (modelName && !modelName.endsWith('s')) lookup.set(`${modelName}s`, uid);
    if (singularName && !singularName.endsWith('s')) lookup.set(`${singularName}s`, uid);
  }

  return lookup;
}

/**
 * @param {any} endpointPath
 * @param {Map<string, string>} contentTypeLookup
 * @returns {string | null}
 */
function inferUidFromPath(endpointPath, contentTypeLookup) {
  const rawPath = String(endpointPath || '').trim();
  if (!rawPath.startsWith('/')) return null;

  const cleanPath = rawPath.split('?')[0];
  const firstSegment = cleanPath.split('/').filter(Boolean)[0];
  if (!firstSegment) return null;

  const key = firstSegment.toLowerCase();
  if (contentTypeLookup.has(key)) return contentTypeLookup.get(key);

  if (key.endsWith('ies')) {
    const singular = `${key.slice(0, -3)}y`;
    if (contentTypeLookup.has(singular)) return contentTypeLookup.get(singular);
  }

  if (key.endsWith('s')) {
    const singular = key.slice(0, -1);
    if (contentTypeLookup.has(singular)) return contentTypeLookup.get(singular);
  }

  return null;
}

/**
 * @param {any} fn
 * @returns {any[]}
 */
function createInvocationArgs(fn) {
  const arity = typeof fn?.length === 'number' ? fn.length : 0;
  return arity > 0 ? new Array(arity).fill(undefined) : [];
}

/**
 * @param {any} methodName
 * @returns {boolean}
 */
function isDescriptorMethodName(methodName) {
  const name = String(methodName || '').toLowerCase();
  if (!name || name === 'meta') return false;

  return /^(list|by|get|find|search|create|update|del|delete|remove|publish|unpublish|archive|unarchive|assign|process|open|close|transfer|validate|shipping|tracking|messages|send)/.test(name);
}

/**
 * @param {any} domains
 * @param {any} roleLevels
 * @param {Record<string, any>} domainMap
 * @param {Record<string, any>} roleMap
 * @returns {string[]}
 */
function expandGrants(domains, roleLevels, domainMap, roleMap) {
  const levels = uniqueStrings(roleLevels);
  const domainKeys = uniqueStrings(domains);
  const grants = new Set();

  for (const domainKey of domainKeys) {
    const domainRoles = toArray(domainMap?.[domainKey]?.roles);
    if (!domainRoles.length) continue;

    for (const roleName of domainRoles) {
      const level = String(roleMap?.[roleName]?.level || '').toLowerCase();
      if (!level) continue;
      if (!levels.length || levels.includes(level)) grants.add(roleName);
    }
  }

  return [...grants];
}

/**
 * @param {Record<string, any>} resources
 * @param {string | null} uid
 * @param {string | null} action
 * @param {string[]} grants
 */
function upsertGeneratedPolicy(resources, uid, action, grants) {
  if (!uid || !action || !grants.length) return;

  const modelName = String(uid.split('.').pop() || 'resource');
  const actionKey = `${modelName}.${action}`;

  if (!resources[uid]) resources[uid] = {};
  if (!resources[uid][actionKey]) {
    resources[uid][actionKey] = {
      policies: [{ key: 'sourceGeneratedAccess', grants: [] }],
    };
  }

  const current = new Set(toArray(resources[uid][actionKey]?.policies?.[0]?.grants));
  for (const roleName of grants) current.add(roleName);
  resources[uid][actionKey].policies[0].grants = [...current];
}

function resolveApiSourceDirectory() {
  return path.join(__dirname, '..', '..', 'api');
}

/**
 * @param {any} strapi
 * @returns {{ warn: (message: string) => void }}
 */
function getLog(strapi) {
  return strapi?.log || { warn: () => {} };
}

/**
 * @param {{ strapi: any, domainsConfig?: Record<string, any>, rolesConfig?: Record<string, any> }} args
 * @returns {Promise<Record<string, any>>}
 */
async function buildResourcesFromApiProviderSource({ strapi, domainsConfig = {}, rolesConfig = {} }) {
  const resources = {};
  const contentTypeLookup = buildContentTypeLookup(strapi);
  const apiDir = resolveApiSourceDirectory();
  const log = getLog(strapi);

  if (!fs.existsSync(apiDir)) {
    log.warn(`[api-provider-seed] api source directory missing: ${apiDir}`);
    return resources;
  }

  const files = fs
    .readdirSync(apiDir)
    .filter((/** @type {string} */ name) => name.toLowerCase().endsWith('.js') && name !== 'index.js')
    .sort((/** @type {string} */ a, /** @type {string} */ b) => a.localeCompare(b));

  for (const fileName of files) {
    const fullPath = path.join(apiDir, fileName);

    let mod;
    try {
      mod = await import(pathToFileURL(fullPath).href);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`[api-provider-seed] failed to import source file ${fileName}: ${message}`);
      continue;
    }

    for (const exported of Object.values(mod)) {
      if (!exported || typeof exported !== 'object' || Array.isArray(exported)) continue;

      const endpointSet = /** @type {any} */ (exported);

      const metaUid = typeof endpointSet?.meta?.uid === 'string' ? endpointSet.meta.uid : null;
      const defaultDomains = uniqueStrings(endpointSet?.meta?.domains);
      const defaultRoleLevels = uniqueStrings(endpointSet?.meta?.roles);

      for (const [methodName, value] of Object.entries(endpointSet)) {
        if (methodName === 'meta' || typeof value !== 'function') continue;
        if (!isDescriptorMethodName(methodName)) continue;
        if (value.constructor?.name === 'AsyncFunction') continue;

        let descriptor;
        try {
          descriptor = value(...createInvocationArgs(value));
        } catch {
          continue;
        }

        if (descriptor && typeof descriptor.then === 'function') {
          descriptor.catch(() => {});
          continue;
        }

        if (!descriptor || typeof descriptor !== 'object') continue;

        const endpointPath = descriptor.path || descriptor.url;
        if (String(endpointPath || '').startsWith('/upload')) continue;

        const uid = metaUid || inferUidFromPath(endpointPath, contentTypeLookup);
        if (!uid) continue;

        const action = descriptor.action || inferAction(descriptor.method, endpointPath, methodName);
        if (!action) continue;

        const domains = uniqueStrings(descriptor.apps).length ? descriptor.apps : defaultDomains;
        const roleLevels = uniqueStrings(descriptor.approle).length ? descriptor.approle : defaultRoleLevels;
        const grants = expandGrants(domains, roleLevels, domainsConfig, rolesConfig);
        if (!grants.length) continue;

        upsertGeneratedPolicy(resources, uid, action, grants);
      }
    }
  }

  return resources;
}

module.exports = {
  buildResourcesFromApiProviderSource,
};
