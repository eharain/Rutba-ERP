'use strict';

// Seeder: reads @rutba/api-provider's static config (domains.json + roles.json)
// AND its endpoint descriptors under api/*.js, and upserts everything into
// the plugin's DB tables: api_pro_app_domains, app_roles, api_interfaces,
// api_interface_methods, api_method_policies.
//
// Idempotent â€” re-running updates existing rows by their natural keys:
//   domains  â†’ unique `key`
//   roles    â†’ unique `key`
//   interfaces â†’ unique `key` (= contentTypeUid)
//   methods  â†’ key `${interfaceKey}:${methodName}`
//   policies â†’ key `${interfaceKey}:${methodName}:${roleKey}`
//
// Mirrors the logic in @rutba/api-provider/server/access-guard/build-resources.cjs
// (action inference, grant expansion) but captures HTTP method and path per
// endpoint so the plugin can author/scaffold against them.

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { pathToFileURL } = require('url');

const fileStore = require('./file-store');

const APP_DOMAIN_UID = 'plugin::api-pro.app-domain';
const APP_ROLE_UID = 'plugin::api-pro.app-role';
const INTERFACE_UID = 'plugin::api-pro.api-interface';
const METHOD_UID = 'plugin::api-pro.api-interface-method';
const POLICY_UID = 'plugin::api-pro.api-method-policy';

// Bump when the seeder's DB-write logic changes in a way that requires every
// deployment to reseed even if descriptor contents are unchanged. A mismatch
// between this constant and the value stored in the checkpoint forces a
// reseed regardless of file hashes.
const SEEDER_VERSION = 3;

// â”€â”€â”€ api-provider resolution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ descriptor introspection (ported from build-resources.cjs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  return /^(list|by|get|find|search|create|update|del|delete|remove|publish|unpublish|archive|unarchive|assign|process|open|close|transfer|validate|shipping|tracking|messages|send|make|set|toggle|reset|approve|reject|accept|cancel|reorder|merge|resolve|recompute|sync|run|rebuild)/.test(name);
}

function createInvocationArgs(fn) {
  const arity = typeof fn?.length === 'number' ? fn.length : 0;
  return arity > 0 ? new Array(arity).fill(undefined) : [];
}

// Build (singular|plural|model) â†’ UID lookup so endpoints without explicit
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

// Expand (domains Ã— role levels) â†’ flat list of role keys, using the
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
      // Interface-level per-role scope, applied to every policy (method) in
      // this file unless overridden per-policy via `descriptor.scope`. Optional
      // â€” descriptors without this block default to unrestricted at every level.
      const interfaceScope = (exported?.meta?.scope && typeof exported.meta.scope === 'object')
        ? exported.meta.scope
        : null;

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

        // Per-policy scope override (method-level) merged on top of the
        // interface-level scope by templatesForRole.
        const policyScope = (descriptor?.scope && typeof descriptor.scope === 'object')
          ? descriptor.scope
          : null;

        out.push({
          uid,
          methodName,
          action,
          method: String(descriptor.method || 'GET').toLowerCase(),
          path: endpointPath,
          routeTokens,
          grants,
          fileName,
          interfaceScope,
          policyScope,
        });
      }
    }
  }
  return out;
}

// â”€â”€â”€ upsert helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  // Build domainKey â†’ domainId map after domains exist
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
  // interfaceKey:methodName â†’ method row
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

// â”€â”€ per-level template builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Vocabulary (matches `packages/api-provider/api/<resource>.js` conventions):
//
//   INTERFACE â€” the top-level descriptor file (e.g. cash-registers.js).
//   POLICY    â€” each method exported on that interface (e.g. list, byId,
//               create, open, close). Methods ARE policies.
//   CONTEXT   â€” the per-role data flowing into a policy. Split into:
//                 scope â€” server-side enforcement: filter scope
//                                 templates injected by the plugin's
//                                 request interceptor. Per role-level.
//                 clientContext â€” client-side hints: defaults the api-provider
//                                 may apply to outgoing requests. Reserved for
//                                 future use; the existing `params` block on
//                                 each method covers this today.
//
// Authoring shape:
//
//   meta: {
//     uid: '...',
//     domains: [...],
//     roles: ['admin', 'manager', 'staff'],
//     // Interface-level context applied to every policy in this file.
//     // Per-policy overrides via `scope`/`clientContext` inside the
//     // policy itself (see methods below).
//     scope: {
//       admin:   {},                                  // unrestricted
//       manager: {},                                  // unrestricted
//       staff: {
//         scope: 'owner+recency',                     // shorthand
//         ownerField: 'opened_by',                    // optional (default 'createdBy')
//         recencyField: 'opened_at',                  // optional (default 'createdAt')
//         recencyToken: '$last7days',                 // optional (default)
//         // Or for finer control, replace `scope` with literal templates:
//         filters: { ... }, body: { ... }, populate: { ... }, query: { ... },
//       },
//     },
//     clientContext: { /* hints â€” reserved */ },
//   },
//
//   list: ({...} = {}) => ({
//     path: '...',
//     action: 'find',
//     ...
//     // Per-policy override of the interface-level context. Same shape.
//     scope: { staff: { scope: 'recency' } },
//   }),
//
// `scope` shorthand values:
//   'none'          â€” no filter (default if level missing)
//   'owner'         â€” { ownerField: { id: { $eq: '$user.id' } } } on find/findOne/update/delete;
//                     body stamps `{ ownerField: '$user.id' }` on create.
//   'owner+recency' â€” `owner` filter PLUS recency filter on `find` only.
//                     (findOne/update/delete stay ownership-only â€” a single-row
//                     lookup already targets a specific id.)
//   'recency'       â€” recency filter only, on `find` action.
//
// Admin/manager default to unrestricted. Staff defaults to unrestricted unless
// a scope.staff block opts the interface into scoping.

const DEFAULT_RECENCY_TOKEN = '$last7days';

function emptyTemplates() {
  return { filtersTemplate: {}, populateTemplate: {}, bodyTemplate: {}, queryTemplate: {} };
}

function expandScopeShorthand(scope, action, ownerField, recencyField, recencyToken) {
  const a = String(action || '').toLowerCase();
  const ownerFilter = { [ownerField]: { id: { $eq: '$user.id' } } };
  const recencyFilter = { [recencyField]: { $gte: recencyToken } };

  if (scope === 'owner') {
    if (a === 'create') return { bodyTemplate: { [ownerField]: '$user.id' } };
    return { filtersTemplate: ownerFilter };
  }

  if (scope === 'owner+recency') {
    if (a === 'create') return { bodyTemplate: { [ownerField]: '$user.id' } };
    if (a === 'find') return { filtersTemplate: { $and: [ownerFilter, recencyFilter] } };
    // findOne / update / delete: ownership only.
    return { filtersTemplate: ownerFilter };
  }

  if (scope === 'recency') {
    if (a === 'find') return { filtersTemplate: recencyFilter };
    return {};
  }

  return {};
}

// Build the four {filters,populate,body,query}Template fields for one
// per-level block (the block under scope.admin / .manager / .staff).
function buildTemplatesFromLevelBlock(levelBlock, action) {
  if (!levelBlock || typeof levelBlock !== 'object') return emptyTemplates();

  const ownerField = levelBlock.ownerField || 'createdBy';
  const recencyField = levelBlock.recencyField || 'createdAt';
  const recencyToken = levelBlock.recencyToken || DEFAULT_RECENCY_TOKEN;

  // 1) start from shorthand scope (if any)
  const combined = expandScopeShorthand(levelBlock.scope, action, ownerField, recencyField, recencyToken);

  // 2) layer literal templates on top â€” these win over the shorthand
  if (levelBlock.filters)  combined.filtersTemplate  = { ...(combined.filtersTemplate  || {}), ...levelBlock.filters };
  if (levelBlock.populate) combined.populateTemplate = { ...(combined.populateTemplate || {}), ...levelBlock.populate };
  if (levelBlock.body)     combined.bodyTemplate     = { ...(combined.bodyTemplate     || {}), ...levelBlock.body };
  if (levelBlock.query)    combined.queryTemplate    = { ...(combined.queryTemplate    || {}), ...levelBlock.query };

  return {
    filtersTemplate:  combined.filtersTemplate  || {},
    populateTemplate: combined.populateTemplate || {},
    bodyTemplate:     combined.bodyTemplate     || {},
    queryTemplate:    combined.queryTemplate    || {},
  };
}

// Resolve the effective scope block for a (policy, role-level) pair.
// Policy-level scope wins over interface-level when both define the
// same role.
function effectiveLevelBlock(interfaceServerCtx, policyServerCtx, level) {
  const key = String(level || '').toLowerCase();
  const policyBlock = policyServerCtx && typeof policyServerCtx === 'object' ? policyServerCtx[key] : undefined;
  if (policyBlock !== undefined) return policyBlock;
  if (interfaceServerCtx && typeof interfaceServerCtx === 'object') return interfaceServerCtx[key];
  return undefined;
}

function templatesForRole(interfaceServerCtx, policyServerCtx, level, action) {
  const block = effectiveLevelBlock(interfaceServerCtx, policyServerCtx, level);
  return buildTemplatesFromLevelBlock(block, action);
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
      const templates = templatesForRole(d.interfaceScope, d.policyScope, level, d.action);

      const existing = await strapi.db.query(POLICY_UID).findOne({ where: { key: policyKey } });

      // Preserve admin-tuned policies. The Policy Editor bumps templateVersion
      // when an admin saves a custom filter; on subsequent boots we only
      // refresh the relational + bookkeeping fields and leave the template
      // bodies alone.
      const userTuned = existing && Number(existing.templateVersion) > 1;

      const data = {
        key: policyKey,
        name: existing?.name || `${humanize(roleKey)} â†’ ${d.methodName}`,
        roleKey,
        resolverMode: existing?.resolverMode || 'strict',
        interfaceMethod: methodRow.id,
        ...(userTuned ? {} : { ...templates, templateVersion: 1 }),
      };

      if (existing) {
        await strapi.db.query(POLICY_UID).update({ where: { id: existing.id }, data });
      } else {
        await strapi.db.query(POLICY_UID).create({ data });
      }
      count += 1;
    }
  }
  return count;
}

// Fingerprint: one rolling SHA-256 over (path + content) of every seeder
// input file (config/domains.json, config/roles.json, every api/*.js except
// index.js and _-prefixed helpers). One hex string in, one hex string out;
// any change to file names, count, or content yields a different digest.
//
// Hashes (not mtimes) so that `git checkout`, `npm install`, or stray
// filesystem touches don't trigger spurious reseeds. Developer loop is just:
// edit api/foo.js → restart Strapi → reseed happens automatically.
function computeSourceFingerprint(root) {
  const hash = createHash('sha256');
  const targets = [path.join(root, 'config', 'domains.json'), path.join(root, 'config', 'roles.json')];
  const apiDir = path.join(root, 'api');
  if (fs.existsSync(apiDir)) {
    for (const f of fs.readdirSync(apiDir).filter((n) => n.endsWith('.js') && n !== 'index.js' && !n.startsWith('_')).sort()) {
      targets.push(path.join(apiDir, f));
    }
  }
  for (const abs of targets) {
    hash.update(path.relative(root, abs).replace(/\\/g, '/'));
    hash.update('\0');
    try { hash.update(fs.readFileSync(abs)); }
    catch { hash.update('MISSING'); }
    hash.update('\0');
  }
  return `v${SEEDER_VERSION}:${hash.digest('hex')}`;
}

// DB row counts for the tables the seeder writes. Persisted in the checkpoint
// after each successful run; compared on boot to detect drift (manual row
// delete, partial DB restore, etc.) so the seed re-runs even when file
// hashes match.
async function countSeededRows(strapi) {
  const [domains, roles, interfaces, methods, policies] = await Promise.all([
    strapi.db.query(APP_DOMAIN_UID).count({}),
    strapi.db.query(APP_ROLE_UID).count({}),
    strapi.db.query(INTERFACE_UID).count({}),
    strapi.db.query(METHOD_UID).count({}),
    strapi.db.query(POLICY_UID).count({}),
  ]);
  return { domains, roles, interfaces, methods, policies };
}

function countsDiffer(a, b) {
  if (!a || !b) return true;
  for (const k of ['domains', 'roles', 'interfaces', 'methods', 'policies']) {
    if (Number(a[k]) !== Number(b[k])) return `${k} ${a[k]} → ${b[k]}`;
  }
  return false;
}

// â”€â”€â”€ public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function runFullSeed(strapi, options = {}) {
  const { force = false } = options;
  const root = resolveApiProviderRoot(strapi);
  if (!root) {
    return { ok: false, error: '@rutba/api-provider not resolvable' };
  }

  const fingerprint = computeSourceFingerprint(root);

  if (!force) {
    const checkpoint = await fileStore.readSeedCheckpoint(strapi).catch(() => null);
    if (checkpoint?.fingerprint === fingerprint) {
      // Files match — verify the DB still holds what we wrote last time.
      const currentCounts = await countSeededRows(strapi).catch(() => null);
      const drift = countsDiffer(checkpoint.counts, currentCounts);
      if (!drift) {
        strapi.log.info(`[api-pro seeder] skip: descriptors unchanged since ${checkpoint.seededAt}`);
        return { ok: true, skipped: true, ...checkpoint.summary };
      }
      strapi.log.info(`[api-pro seeder] reseed: DB drift detected (${drift})`);
    } else {
      strapi.log.info(`[api-pro seeder] reseed: fingerprint ${checkpoint?.fingerprint ?? '(none)'} → ${fingerprint}`);
    }
  }

  const domainsConfig = loadJson(path.join(root, 'config', 'domains.json'));
  const rolesConfig = loadJson(path.join(root, 'config', 'roles.json'));

  const domainCount = await seedDomains(strapi, domainsConfig);
  const roleCount = await seedRoles(strapi, rolesConfig, domainsConfig);

  const descriptors = await walkApiDescriptors(root, domainsConfig, rolesConfig, strapi);
  const { interfaceCount, methodCount, methodByCompositeKey } = await seedInterfacesAndMethods(strapi, descriptors);
  const policyCount = await seedPolicies(strapi, descriptors, methodByCompositeKey, rolesConfig);

  strapi.apiPro?.clearAllCache?.();

  const summary = {
    domains: domainCount,
    roles: roleCount,
    interfaces: interfaceCount,
    methods: methodCount,
    policies: policyCount,
    descriptorsScanned: descriptors.length,
  };

  // Snapshot DB row counts right after the seed succeeds — the boot check
  // compares the live counts against these to catch drift between runs.
  const counts = await countSeededRows(strapi).catch(() => null);

  // Persist checkpoint AFTER the seed succeeds. A failed/aborted seed leaves
  // the previous checkpoint (or nothing) in place so the next boot retries.
  try {
    await fileStore.writeSeedCheckpoint(strapi, {
      seededAt: new Date().toISOString(),
      fingerprint,
      counts,
      summary,
    });
  } catch (e) {
    strapi.log.warn(`[api-pro seeder] could not write checkpoint: ${e?.message}`);
  }

  return { ok: true, skipped: false, ...summary };
}

module.exports = {
  runFullSeed,
  resolveApiProviderRoot,
  walkApiDescriptors,
  computeSourceFingerprint,
};
