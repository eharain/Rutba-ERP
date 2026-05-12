'use strict';

// Seeder: reads @rutba/api-provider's static config (domains.json + roles.json)
// AND its endpoint descriptors under api/*.js, and upserts everything into
// the plugin's DB tables: api_pro_app_domains, app_roles, api_interfaces,
// api_interface_methods, api_method_policies.
//
// Idempotent — re-running updates existing rows by their natural keys:
//   domains  → unique `key`
//   roles    → unique `key`
//   interfaces → unique `key` (= contentTypeUid)
//   methods  → key `${interfaceKey}:${methodName}`
//   policies → key `${interfaceKey}:${methodName}:${roleKey}`
//
// Mirrors the logic in @rutba/api-provider/server/access-guard/build-resources.cjs
// (action inference, grant expansion) but captures HTTP method and path per
// endpoint so the plugin can author/scaffold against them.

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_DOMAIN_UID = 'plugin::api-pro.app-domain';
const APP_ROLE_UID = 'plugin::api-pro.app-role';
const INTERFACE_UID = 'plugin::api-pro.api-interface';
const METHOD_UID = 'plugin::api-pro.api-interface-method';
const POLICY_UID = 'plugin::api-pro.api-method-policy';

// ─── api-provider resolution ────────────────────────────────────────────────
// api-provider's package.json doesn't export './package.json', so we can't
// use that path. Instead, resolve a config file we know IS exported
// (./config/domains) and walk up two levels to find the package root.
// This mirrors how pos-strapi/config/plugins.js locates the package.
function resolveApiProviderRoot(strapi) {
  const cwd = strapi?.dirs?.app?.root || process.cwd();
  try {
    const domainsPath = require.resolve('@rutba/api-provider/config/domains', { paths: [cwd] });
    return path.dirname(path.dirname(domainsPath));
  } catch (e) {
    strapi?.log?.warn(`[api-pro seeder] @rutba/api-provider not resolvable from ${cwd}: ${e?.message}`);
    return null;
  }
}

function loadJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

// ─── descriptor introspection (ported from build-resources.cjs) ─────────────
function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((v) => typeof v === 'string' && v.trim()))];
}

function inferAction(method, endpointPath, methodName) {
  const m = String(method || '').toLowerCase();
  const p = String(endpointPath || '');
  const n = String(methodName || '').toLowerCase();

  if (n.includes('publish')) return n.includes('unpublish') ? 'unpublish' : 'publish';
  if (n.includes('delete') || n === 'del') return 'delete';
  if (n.includes('update') || n.startsWith('put')) return 'update';
  if (n.includes('create') || n.startsWith('post')) return 'create';
  if (n.includes('byid') || n.includes('findone')) return 'findOne';
  if (n.includes('list') || n.includes('search') || n.includes('find')) return 'find';

  if (m === 'post') return 'create';
  if (m === 'put' || m === 'patch') return 'update';
  if (m === 'delete') return 'delete';
  if (m === 'get') return /\/[^/]+\/[:$]|\/\$\{/.test(p) ? 'findOne' : 'find';

  return null;
}

function isDescriptorMethodName(methodName) {
  const name = String(methodName || '').toLowerCase();
  if (!name || name === 'meta') return false;
  return /^(list|by|get|find|search|create|update|del|delete|remove|publish|unpublish|archive|unarchive|assign|process|open|close|transfer|validate|shipping|tracking|messages|send)/.test(name);
}

function createInvocationArgs(fn) {
  const arity = typeof fn?.length === 'number' ? fn.length : 0;
  return arity > 0 ? new Array(arity).fill(undefined) : [];
}

// Build (singular|plural|model) → UID lookup so endpoints without explicit
// meta.uid can still be routed to a content-type.
function buildContentTypeLookup(strapi) {
  const lookup = new Map();
  for (const [uid, model] of Object.entries(strapi?.contentTypes || {})) {
    if (!uid.startsWith('api::')) continue;
    const singular = String(model?.info?.singularName || '').toLowerCase();
    const plural = String(model?.info?.pluralName || '').toLowerCase();
    const tail = String(uid.split('.').pop() || '').toLowerCase();
    if (singular) lookup.set(singular, uid);
    if (plural) lookup.set(plural, uid);
    if (tail) lookup.set(tail, uid);
  }
  return lookup;
}

function inferUidFromPath(endpointPath, lookup) {
  const raw = String(endpointPath || '').trim();
  if (!raw.startsWith('/')) return null;
  const first = raw.split('?')[0].split('/').filter(Boolean)[0];
  if (!first) return null;
  const key = first.toLowerCase();
  if (lookup.has(key)) return lookup.get(key);
  if (key.endsWith('ies') && lookup.has(`${key.slice(0, -3)}y`)) return lookup.get(`${key.slice(0, -3)}y`);
  if (key.endsWith('s') && lookup.has(key.slice(0, -1))) return lookup.get(key.slice(0, -1));
  return null;
}

// Expand (domains × role levels) → flat list of role keys, using the
// api-provider's domain/role configs.
function expandGrants(domains, roleLevels, domainMap, roleMap) {
  const levels = uniqueStrings(roleLevels);
  const dKeys = uniqueStrings(domains);
  const grants = new Set();
  for (const dk of dKeys) {
    const dr = Array.isArray(domainMap?.[dk]?.roles) ? domainMap[dk].roles : [];
    for (const roleName of dr) {
      const level = String(roleMap?.[roleName]?.level || '').toLowerCase();
      if (!level) continue;
      if (!levels.length || levels.includes(level)) grants.add(roleName);
    }
  }
  return [...grants];
}

// Walk api/*.js, yielding { uid, methodName, action, method, path, signature, grants }.
async function walkApiDescriptors(root, domainsConfig, rolesConfig, strapi) {
  const apiDir = path.join(root, 'api');
  if (!fs.existsSync(apiDir)) return [];

  const lookup = buildContentTypeLookup(strapi);
  const out = [];

  const files = fs
    .readdirSync(apiDir)
    .filter((n) => n.endsWith('.js') && n !== 'index.js' && !n.startsWith('_') && !n.startsWith('__'))
    .sort();

  for (const fileName of files) {
    const fullPath = path.join(apiDir, fileName);
    let mod;
    try {
      mod = await import(pathToFileURL(fullPath).href);
    } catch (e) {
      strapi.log.warn(`[api-pro seeder] failed to import ${fileName}: ${e?.message}`);
      continue;
    }

    for (const exported of Object.values(mod)) {
      if (!exported || typeof exported !== 'object' || Array.isArray(exported)) continue;
      const metaUid = typeof exported?.meta?.uid === 'string' ? exported.meta.uid : null;
      const defaultDomains = uniqueStrings(exported?.meta?.domains);
      const defaultRoleLevels = uniqueStrings(exported?.meta?.roles);

      for (const [methodName, value] of Object.entries(exported)) {
        if (methodName === 'meta' || typeof value !== 'function') continue;
        if (!isDescriptorMethodName(methodName)) continue;
        if (value.constructor?.name === 'AsyncFunction') continue;

        let descriptor;
        try {
          descriptor = value(...createInvocationArgs(value));
        } catch {
          continue;
        }
        if (!descriptor || typeof descriptor !== 'object' || typeof descriptor.then === 'function') continue;

        const endpointPath = descriptor.path || descriptor.url;
        if (!endpointPath || String(endpointPath).startsWith('/upload')) continue;

        const uid = metaUid || inferUidFromPath(endpointPath, lookup);
        if (!uid) continue;

        const action = descriptor.action || inferAction(descriptor.method, endpointPath, methodName);
        if (!action) continue;

        const domains = uniqueStrings(descriptor.apps).length ? descriptor.apps : defaultDomains;
        const roleLevels = uniqueStrings(descriptor.approle).length ? descriptor.approle : defaultRoleLevels;
        const grants = expandGrants(domains, roleLevels, domainsConfig, rolesConfig);
        if (grants.length === 0) continue;

        const routeTokens = (String(endpointPath).match(/(?::([a-zA-Z_][\w]*))|(?:\$\{\s*([a-zA-Z_][\w]*)\s*\})/g) || [])
          .map((m) => m.replace(/[:${}\s]/g, ''));

        out.push({
          uid,
          methodName,
          action,
          method: String(descriptor.method || 'GET').toLowerCase(),
          path: endpointPath,
          routeTokens,
          grants,
          fileName,
        });
      }
    }
  }
  return out;
}

// ─── upsert helpers ─────────────────────────────────────────────────────────
async function upsertByKey(strapi, uid, key, data, populate) {
  const existing = await strapi.db.query(uid).findOne({ where: { key } });
  if (existing) {
    return strapi.db.query(uid).update({ where: { id: existing.id }, data, populate });
  }
  return strapi.db.query(uid).create({ data, populate });
}

function humanize(input) {
  return String(input || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

async function seedDomains(strapi, domainsConfig) {
  let count = 0;
  for (const [key, value] of Object.entries(domainsConfig || {})) {
    await upsertByKey(strapi, APP_DOMAIN_UID, key, {
      key,
      name: humanize(value?.name || key),
      description: value?.description || `Auto-seeded domain '${key}' from api-provider/config`,
      isActive: true,
    });
    count += 1;
  }
  return count;
}

async function seedRoles(strapi, rolesConfig, domainsConfig) {
  // Build domainKey → domainId map after domains exist
  const domainRows = await strapi.db.query(APP_DOMAIN_UID).findMany({ select: ['id', 'key'] });
  const domainIdByKey = new Map(domainRows.map((d) => [d.key, d.id]));

  let count = 0;
  for (const [key, value] of Object.entries(rolesConfig || {})) {
    const domainKey = value?.domain;
    const domainId = domainKey ? domainIdByKey.get(domainKey) : null;

    await upsertByKey(strapi, APP_ROLE_UID, key, {
      key,
      name: humanize(key),
      description: `Auto-seeded role '${key}' (level=${value?.level || '?'}, domain=${domainKey || '?'})`,
      isActive: true,
      adminRoleCode: key,
      appDomains: domainId ? [domainId] : [],
    });
    count += 1;
  }
  return count;
}

async function seedInterfacesAndMethods(strapi, descriptors) {
  // Group descriptors by uid
  const byUid = new Map();
  for (const d of descriptors) {
    if (!byUid.has(d.uid)) byUid.set(d.uid, []);
    byUid.get(d.uid).push(d);
  }

  let interfaceCount = 0;
  let methodCount = 0;
  // interfaceKey:methodName → method row
  const methodByCompositeKey = new Map();

  for (const [uid, group] of byUid.entries()) {
    const interfaceKey = uid.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    const filePathField = `api/${(group[0]?.fileName || `${interfaceKey}.js`).replace(/\.js$/, '')}.js`;

    const ifaceRow = await upsertByKey(strapi, INTERFACE_UID, interfaceKey, {
      key: interfaceKey,
      name: humanize(uid.split('.').pop() || interfaceKey),
      filePath: filePathField,
      uid,
      status: 'generated',
    });
    interfaceCount += 1;

    for (const d of group) {
      const methodKey = `${interfaceKey}:${d.methodName}`;
      const methodRow = await upsertByKey(strapi, METHOD_UID, methodKey, {
        key: methodKey,
        name: d.methodName,
        action: d.action,
        method: d.method,
        path: d.path,
        routeTokens: d.routeTokens,
        inputSignature: d.routeTokens,
        apps: [],
        appRoles: d.grants,
        apiInterface: ifaceRow.id,
      });
      methodByCompositeKey.set(methodKey, methodRow);
      methodCount += 1;
    }
  }

  return { interfaceCount, methodCount, methodByCompositeKey };
}

// Role-level → default template hint. Admin-level roles get unrestricted
// templates by default; manager/staff get an empty starter shape that flags
// them as needing manual scoping via the Policy Editor (Phase 8 QueryBuilders).
function defaultTemplatesForLevel(level, action) {
  const lvl = String(level || '').toLowerCase();
  const empty = { filtersTemplate: {}, populateTemplate: {}, bodyTemplate: {}, queryTemplate: {} };

  if (lvl === 'admin') return empty; // unrestricted

  // Non-admin actions that create rows benefit from auto-stamping creator.
  // We leave these EMPTY too — the admin can opt-in via the editor — but a
  // common pattern would be filtersTemplate: { createdBy: { id: { $eq: '$user.id' } } }
  // for find/findOne/update/delete and bodyTemplate: { user: '$user.id' } for create.
  return empty;
}

async function seedPolicies(strapi, descriptors, methodByCompositeKey, rolesConfig) {
  let count = 0;
  for (const d of descriptors) {
    const interfaceKey = d.uid.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    const methodKey = `${interfaceKey}:${d.methodName}`;
    const methodRow = methodByCompositeKey.get(methodKey);
    if (!methodRow) continue;

    for (const roleKey of d.grants) {
      const policyKey = `${interfaceKey}:${d.methodName}:${roleKey}`;
      const level = rolesConfig?.[roleKey]?.level || 'unknown';
      const templates = defaultTemplatesForLevel(level, d.action);
      const isUnrestricted = level === 'admin';

      await upsertByKey(strapi, POLICY_UID, policyKey, {
        key: policyKey,
        name: `${humanize(roleKey)} → ${d.methodName}`,
        roleKey,
        resolverMode: 'strict',
        ...templates,
        templateVersion: 1,
        interfaceMethod: methodRow.id,
      });
      count += 1;
    }
  }
  return count;
}

// ─── public API ─────────────────────────────────────────────────────────────
async function runFullSeed(strapi) {
  const root = resolveApiProviderRoot(strapi);
  if (!root) {
    return { ok: false, error: '@rutba/api-provider not resolvable' };
  }

  const domainsConfig = loadJson(path.join(root, 'config', 'domains.json'));
  const rolesConfig = loadJson(path.join(root, 'config', 'roles.json'));

  const domainCount = await seedDomains(strapi, domainsConfig);
  const roleCount = await seedRoles(strapi, rolesConfig, domainsConfig);

  const descriptors = await walkApiDescriptors(root, domainsConfig, rolesConfig, strapi);
  const { interfaceCount, methodCount, methodByCompositeKey } = await seedInterfacesAndMethods(strapi, descriptors);
  const policyCount = await seedPolicies(strapi, descriptors, methodByCompositeKey, rolesConfig);

  strapi.apiPro?.clearAllCache?.();

  return {
    ok: true,
    domains: domainCount,
    roles: roleCount,
    interfaces: interfaceCount,
    methods: methodCount,
    policies: policyCount,
    descriptorsScanned: descriptors.length,
  };
}

module.exports = {
  runFullSeed,
  resolveApiProviderRoot,
  walkApiDescriptors,
};
