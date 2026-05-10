'use strict';

/**
 * api-provider-seed.js
 *
 * Seeds the strapi-api-guard-pro plugin.
 *
 * Source of truth:
 * - domains/roles: `@rutba/api-provider/config`
 * - resources/policies/grants: `@rutba/api-provider` source endpoint descriptors
 *   (api/*.js)
 *
 * Idempotent: delegates to the plugin's `data-transfer` service, which upserts
 * by stable keys (`domain.key`, `role.key`, `resource.content_type_uid`,
 * `policy.uid`).
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const domainsConfig = require('@rutba/api-provider/config/domains');
const rolesConfig = require('@rutba/api-provider/config/roles');

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(toArray(values).filter((v) => typeof v === 'string' && v.trim()))];
}

function inferActionFromDescriptor(method, endpointPath, methodName) {
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

function buildContentTypeLookups(strapi) {
  const lookup = new Map();

  for (const [uid, model] of Object.entries(strapi.contentTypes || {})) {
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

function createSeedInvocationArgs(fn) {
  const arity = typeof fn?.length === 'number' ? fn.length : 0;
  if (!arity) return [];
  return new Array(arity).fill(undefined);
}

  if (key.endsWith('s')) {
    const singular = key.slice(0, -1);
    if (contentTypeLookup.has(singular)) return contentTypeLookup.get(singular);
  }

  return null;
}

function expandGrantsFromDomainAndLevel(domains, roleLevels, domainMap, roleMap) {
  const levels = uniqueStrings(roleLevels);
  const domainKeys = uniqueStrings(domains);
  const grants = new Set();

  for (const domainKey of domainKeys) {
    const domainRoles = toArray(domainMap?.[domainKey]?.roles);
    if (!domainRoles.length) continue;

    for (const roleName of domainRoles) {
      const level = String(roleMap?.[roleName]?.level || '').toLowerCase();
      if (!level) continue;
      if (!levels.length || levels.includes(level)) {
        grants.add(roleName);
      }
    }
  }

  return [...grants];
}

function upsertGeneratedPolicy(resources, uid, action, grants) {
  if (!uid || !action || !grants.length) return;

  const modelName = String(uid.split('.').pop() || 'resource');
  const actionKey = `${modelName}.${action}`;

  if (!resources[uid]) resources[uid] = {};
  if (!resources[uid][actionKey]) {
    resources[uid][actionKey] = {
      policies: [
        {
          key: 'sourceGeneratedAccess',
          grants: [],
        },
      ],
    };
  }

  const policy = resources[uid][actionKey].policies?.[0];
  const current = new Set(toArray(policy?.grants));
  for (const roleName of grants) current.add(roleName);
  policy.grants = [...current];
}

async function buildResourcesFromApiProviderSource(strapi) {
  const packageJsonPath = require.resolve('@rutba/api-provider/package.json');
  const packageRoot = path.dirname(packageJsonPath);
  const apiDir = path.join(packageRoot, 'api');

  /** @type {Record<string, any>} */
  const resources = {};
  const contentTypeLookup = buildContentTypeLookups(strapi);

  if (!fs.existsSync(apiDir)) {
    strapi.log.warn(`[api-provider-seed] api source directory missing: ${apiDir}`);
    return resources;
  }

  const files = fs
    .readdirSync(apiDir)
    .filter((name) => name.toLowerCase().endsWith('.js') && name !== 'index.js')
    .sort((a, b) => a.localeCompare(b));

  for (const fileName of files) {
    const fullPath = path.join(apiDir, fileName);

    let mod;
    try {
      mod = await import(pathToFileURL(fullPath).href);
    } catch (err) {
      strapi.log.warn(`[api-provider-seed] failed to import source file ${fileName}: ${err.message}`);
      continue;
    }

    for (const exported of Object.values(mod)) {
      if (!exported || typeof exported !== 'object' || Array.isArray(exported)) continue;

      const metaUid = typeof exported?.meta?.uid === 'string' ? exported.meta.uid : null;
      const defaultDomains = uniqueStrings(exported?.meta?.domains);
      const defaultRoleLevels = uniqueStrings(exported?.meta?.roles);

      for (const [methodName, value] of Object.entries(exported)) {
        if (methodName === 'meta' || typeof value !== 'function') continue;

        let descriptor;
        try {
          descriptor = value(...createSeedInvocationArgs(value));
        } catch {
          continue;
        }

        if (!descriptor || typeof descriptor !== 'object') continue;

        const endpointPath = descriptor.path || descriptor.url;
        const uid = metaUid || inferUidFromPath(endpointPath, contentTypeLookup);
        if (!uid) continue;

        const action = descriptor.action || inferActionFromDescriptor(descriptor.method, endpointPath, methodName);
        if (!action) continue;

        const domains = uniqueStrings(descriptor.apps).length ? descriptor.apps : defaultDomains;
        const roleLevels = uniqueStrings(descriptor.approle).length ? descriptor.approle : defaultRoleLevels;
        const grants = expandGrantsFromDomainAndLevel(domains, roleLevels, domainsConfig, rolesConfig);
        if (!grants.length) continue;

        upsertGeneratedPolicy(resources, uid, action, grants);
      }
    }
  }

  return resources;
}

async function seedApiProvider(strapi) {
  if (!strapi.plugin('api-guard-pro')) {
    strapi.log.warn('[api-provider-seed] api-guard-pro plugin not found — skipping seed');
    return;
  }

  const service = strapi.service('plugin::api-guard-pro.data-transfer');
  if (!service || typeof service.importData !== 'function') {
    strapi.log.warn('[api-provider-seed] data-transfer service unavailable — skipping seed');
    return;
  }

  const resources = await buildResourcesFromApiProviderSource(strapi);
  const payload = {
    domains: domainsConfig || {},
    roles: rolesConfig || {},
    resources,
  };

  const domainCount = Object.keys(payload.domains).length;
  const roleCount = Object.keys(payload.roles).length;
  const resourceCount = Object.keys(payload.resources).length;

  strapi.log.info(
    `[api-provider-seed] importing domains=${domainCount} roles=${roleCount} resources=${resourceCount}`
  );

  const results = await service.importData(payload, /* clean */ false);

  const fmt = (b) =>
    `created=${b?.created ?? 0} updated=${b?.updated ?? 0} errors=${b?.errors?.length ?? 0}`;

  strapi.log.info(`[api-provider-seed] domains:    ${fmt(results?.domains)}`);
  strapi.log.info(`[api-provider-seed] roles:      ${fmt(results?.roles)}`);
  strapi.log.info(`[api-provider-seed] resources:  ${fmt(results?.resources)}`);
  strapi.log.info(`[api-provider-seed] policies:   ${fmt(results?.policies)}`);

  for (const bucket of ['domains', 'roles', 'resources', 'policies']) {
    const errs = results?.[bucket]?.errors || [];
    for (const e of errs) {
      strapi.log.warn(`[api-provider-seed] ${bucket} error: ${JSON.stringify(e)}`);
    }
  }

  strapi.log.info('[api-provider-seed] complete ✓');
}

module.exports = seedApiProvider;
