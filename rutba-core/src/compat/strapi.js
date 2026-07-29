'use strict';

/**
 * `strapi`-shaped compatibility object so PORTED SOURCE FILES run inside
 * rutba-core unmodified:
 *
 *  - the api-pro plugin's own services (packages/strapi-api-pro/server/src/*)
 *  - pos-strapi module code (controllers / services / state machines /
 *    lifecycles / shared utils) pulled in per migration tranche.
 *
 * Surface implemented = surface that code actually uses:
 *
 *   strapi.config.get('plugin::api-pro')  → merged plugin config
 *   strapi.db.query(uid)                  → adapter over the shim (reads) +
 *                                           direct scalar writes (update/updateMany/…,
 *                                           lifecycle-free like Strapi's query engine
 *                                           is middleware-free — use for cache columns only)
 *   strapi.documents(uid)                 → the shim (document middlewares fire)
 *   strapi.entityService                  → id-based adapter over the shim
 *   strapi.service(uid)                   → pos-strapi service modules, instantiated
 *                                           against this compat object
 *   strapi.apiPro.cache                   → TTL cache (get/set/clearUser/clearAll)
 *   strapi.log / strapi.eventHub          → console logger / plain EventEmitter
 *
 * buildCompatStrapi() also assigns `global.strapi` — ported pos-strapi files
 * reference the bare `strapi` global exactly as they do under Strapi.
 */

const path = require('path');
const { EventEmitter } = require('events');
const { REPO_ROOT } = require('../config/env');
const { withTransaction, getDb } = require('../db/connection');
const { documents, getRegistry } = require('../documents');
const { applyFilters } = require('../documents/query');

const PLUGIN_ROOT = path.join(REPO_ROOT, 'packages', 'strapi-api-pro', 'server', 'src');
const POS_SRC = path.join(REPO_ROOT, 'pos-strapi', 'src');
const pluginConfig = require(path.join(PLUGIN_ROOT, 'config.js'));

/**
 * Seed require.cache with a stub for '@strapi/strapi' (as resolved from
 * pos-strapi's node_modules) BEFORE any pos-strapi source file is required.
 * Service files import only `factories.createCoreService` from it; loading the
 * real package would drag the whole Strapi runtime into this process. The stub
 * returns a marker object the service resolver instantiates lazily.
 */
let factoryStubInstalled = false;
function installStrapiFactoryStub() {
  if (factoryStubInstalled) return;
  factoryStubInstalled = true;
  let resolved;
  try {
    resolved = require.resolve('@strapi/strapi', { paths: [POS_SRC] });
  } catch {
    return; // pos-strapi deps absent — service loading will fail visibly later
  }
  if (require.cache[resolved]) return; // real module already loaded — leave it
  const marker = (kind) => (uid, cfg) => ({ __rutbaCoreFactory: kind, uid, cfg });
  const factories = {
    createCoreService: marker('service'),
    createCoreController: marker('controller'),
    createCoreRouter: marker('router'),
  };
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: { factories },
  };
}

/** Require a pos-strapi source file (controllers, services, utils, …). */
function posRequire(relPath) {
  installStrapiFactoryStub();
  return require(path.join(POS_SRC, relPath));
}

function createCache({ ttlMs = 30_000, maxEntries = 5_000, enabled = true } = {}) {
  const store = new Map();
  return {
    get(key) {
      if (!enabled) return undefined;
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() > hit.expires) { store.delete(key); return undefined; }
      return hit.value;
    },
    set(key, value) {
      if (!enabled) return;
      if (store.size >= maxEntries) {
        const oldest = store.keys().next().value;
        store.delete(oldest);
      }
      store.set(key, { value, expires: Date.now() + ttlMs });
    },
    clearUser(userId) {
      const prefix = `u:${userId}:`;
      for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
    },
    clearAll() { store.clear(); },
  };
}

/** Drop populate keys the (possibly partial) model doesn't declare, and map
 *  query-engine populate opts (`where`) onto the shim dialect (`filters`). */
function sanitizePopulate(model, populate, reg) {
  if (!populate || typeof populate !== 'object' || Array.isArray(populate)) return populate;
  const known = new Set([
    ...model.relations.map((r) => r.attr),
    ...model.media.map((m) => m.attr),
    ...model.components.map((c) => c.attr),
  ]);
  const out = {};
  for (const [attr, rawOpts] of Object.entries(populate)) {
    if (!known.has(attr)) continue;
    let opts = rawOpts;
    if (opts && typeof opts === 'object' && opts.where && !opts.filters) {
      const { where, ...rest } = opts;
      opts = { ...rest, filters: where };
    }
    if (opts && typeof opts === 'object' && opts.populate) {
      const rel = model.relations.find((r) => r.attr === attr);
      const target = rel ? reg.models.get(rel.target) : null;
      out[attr] = target
        ? { ...opts, populate: sanitizePopulate(target, opts.populate, reg) }
        : opts;
    } else {
      out[attr] = opts;
    }
  }
  return out;
}

/** Normalize query-engine orderBy ({a:'asc'} | [{a:'asc'},…]) → shim sort strings. */
function orderByToSort(orderBy) {
  if (!orderBy) return undefined;
  const items = Array.isArray(orderBy) ? orderBy : [orderBy];
  const sort = [];
  for (const item of items) {
    if (typeof item === 'string') sort.push(item);
    else for (const [attr, dir] of Object.entries(item)) sort.push(`${attr}:${dir}`);
  }
  return sort;
}

/** Map a scalar-only query-engine `data` payload to snake_case column values. */
function scalarWriteValues(model, data) {
  const values = {};
  for (const [attr, v] of Object.entries(data || {})) {
    if (attr === 'publishedAt') { values.published_at = v; continue; }
    const s = model.scalars.find((x) => x.attr === attr);
    if (!s) {
      throw new Error(
        `compat db.query(${model.uid}): "${attr}" is not a scalar attribute — ` +
        'query-engine writes support scalar cache columns only (use documents() for relations)'
      );
    }
    values[s.column] = s.type === 'json' && v !== null && typeof v !== 'string' ? JSON.stringify(v) : v;
  }
  return values;
}

/**
 * db.query(uid) adapter. Reads map onto the shim (filters dialect ⊇ the query
 * engine's `where`). Writes are DIRECT scalar row updates — like Strapi's query
 * engine they bypass document middlewares, so ported code uses them only for
 * denormalised cache columns (stock_quantity, quantity_remaining, …).
 */
function dbQueryAdapter(uid) {
  const reg = getRegistry();
  const model = reg.models.get(uid);
  if (!model) throw new Error(`compat db.query: unknown uid ${uid}`);
  const docs = documents(uid);
  const toParams = ({ where, populate, orderBy, limit, offset, select } = {}) => ({
    filters: where || {},
    populate: sanitizePopulate(model, populate, reg),
    sort: orderByToSort(orderBy),
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { start: offset } : {}),
    // `select` is intentionally ignored — the shim returns all scalars (superset).
  });
  const matchingIds = async (where) => {
    const db = getDb();
    const qb = db(`${model.tableName} as t`).select('t.id');
    applyFilters(db, reg, qb, model, where || {}, 't');
    return (await qb).map((r) => r.id);
  };
  return {
    findOne: async (opts = {}) => docs.findFirst(toParams(opts)),
    findMany: async (opts = {}) => docs.findMany(toParams(opts)),
    count: async (opts = {}) => docs.count({ filters: (opts && opts.where) || {} }),
    async update({ where, data } = {}) {
      const ids = await matchingIds(where);
      if (!ids.length) return null;
      const values = scalarWriteValues(model, data);
      values.updated_at = new Date();
      await getDb()(model.tableName).where('id', ids[0]).update(values);
      return docs.findFirst({ filters: { id: { $eq: ids[0] } } });
    },
    async updateMany({ where, data } = {}) {
      const ids = await matchingIds(where);
      if (!ids.length) return { count: 0 };
      const values = scalarWriteValues(model, data);
      values.updated_at = new Date();
      await getDb()(model.tableName).whereIn('id', ids).update(values);
      return { count: ids.length };
    },
    async delete({ where } = {}) {
      const ids = await matchingIds(where);
      if (!ids.length) return null;
      const row = await docs.findFirst({ filters: { id: { $eq: ids[0] } } });
      await getDb()(model.tableName).where('id', ids[0]).del();
      return row;
    },
    async deleteMany({ where } = {}) {
      const ids = await matchingIds(where);
      if (!ids.length) return { count: 0 };
      await getDb()(model.tableName).whereIn('id', ids).del();
      return { count: ids.length };
    },
  };
}

/** Resolve a numeric entity id to its documentId (null when the row is gone). */
async function documentIdOf(model, id) {
  const row = await getDb()(model.tableName).where('id', id).first('document_id');
  return row ? row.document_id : null;
}

/**
 * entityService adapter — the deprecated-but-everywhere id-based API ported
 * modules still call. Routed through documents() so document middlewares
 * (ported lifecycles) fire, matching Strapi where entityService triggers db
 * lifecycles. All tranche types are non-draftAndPublish, so id → documentId
 * resolution is unambiguous.
 */
function entityServiceAdapter() {
  const modelOf = (uid) => {
    const model = getRegistry().models.get(uid);
    if (!model) throw new Error(`compat entityService: unknown uid ${uid}`);
    return model;
  };
  return {
    async findOne(uid, id, opts = {}) {
      return documents(uid).findFirst({
        filters: { id: { $eq: id } },
        populate: opts.populate,
      });
    },
    async findMany(uid, opts = {}) {
      return documents(uid).findMany({
        filters: opts.filters,
        populate: opts.populate,
        sort: orderByToSort(opts.sort) || opts.sort,
        ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
        ...(opts.start !== undefined ? { start: opts.start } : {}),
      });
    },
    async create(uid, opts = {}) {
      return documents(uid).create({ data: opts.data, populate: opts.populate });
    },
    async update(uid, id, opts = {}) {
      const documentId = await documentIdOf(modelOf(uid), id);
      if (!documentId) return null;
      return documents(uid).update({ documentId, data: opts.data, populate: opts.populate });
    },
    async delete(uid, id) {
      const documentId = await documentIdOf(modelOf(uid), id);
      if (!documentId) return null;
      const row = await documents(uid).findFirst({ filters: { id: { $eq: id } } });
      await documents(uid).delete({ documentId });
      return row;
    },
    async count(uid, opts = {}) {
      return documents(uid).count({ filters: opts.filters });
    },
  };
}

/** Minimal core-service base (find/findOne/create/update/delete over the shim). */
function baseCoreService(uid) {
  const docs = documents(uid);
  return {
    find: (params = {}) => docs.findMany(params),
    findOne: (documentId, params = {}) => docs.findOne({ documentId, ...params }),
    create: (params = {}) => docs.create(params),
    update: (documentId, params = {}) => docs.update({ documentId, ...params }),
    delete: (documentId, params = {}) => docs.delete({ documentId, ...params }),
    count: (params = {}) => docs.count(params),
  };
}

/**
 * strapi.service(uid) resolver: loads the pos-strapi service module for
 * `api::<apiName>.<serviceName>` from pos-strapi/src/api/<apiName>/services/,
 * instantiating whatever shape it exports (createCoreService factory stub,
 * plain ({ strapi }) factory, or a plain object). Instances are cached.
 */
function createServiceResolver(strapi) {
  const instances = new Map();
  return function service(uid) {
    if (instances.has(uid)) return instances.get(uid);
    const m = /^api::([^.]+)\.(.+)$/.exec(uid);
    if (!m) throw new Error(`compat strapi.service: unsupported uid ${uid}`);
    const mod = posRequire(path.join('api', m[1], 'services', `${m[2]}.js`));
    let svc;
    if (mod && mod.__rutbaCoreFactory === 'service') {
      const custom = typeof mod.cfg === 'function' ? mod.cfg({ strapi }) : (mod.cfg || {});
      svc = Object.assign(baseCoreService(mod.uid || uid), custom);
    } else if (typeof mod === 'function') {
      svc = mod({ strapi });
    } else {
      svc = mod;
    }
    instances.set(uid, svc);
    return svc;
  };
}

/**
 * Instantiate a ported createCoreController module. The custom-methods object
 * gets the default REST handlers as its PROTOTYPE, so `super.create(ctx)`
 * inside a ported override dispatches to the same handler the seeded core
 * route uses (JS super resolves through the home object's prototype at call
 * time, so Object.setPrototypeOf after creation is sufficient).
 */
function instantiateController(mod, strapi) {
  const { baseController } = require('../http/rest');
  if (mod && mod.__rutbaCoreFactory === 'controller') {
    const custom = typeof mod.cfg === 'function' ? mod.cfg({ strapi }) : (mod.cfg || {});
    Object.setPrototypeOf(custom, baseController(mod.uid));
    return custom;
  }
  return mod; // plain-object controllers (mfg style)
}

function buildCompatStrapi(overrides = {}) {
  installStrapiFactoryStub();
  const config = { ...pluginConfig.default, ...(overrides.apiProConfig || {}) };
  const strapi = {
    config: {
      get(key) {
        if (key === 'plugin::api-pro') return config;
        return undefined;
      },
    },
    db: {
      query: dbQueryAdapter,
      // Caller-scoped transaction: shim ops inside the callback join it (ALS).
      transaction: (cb) => withTransaction((trx) => cb({ trx })),
      get connection() { return getDb(); },
    },
    // Query-engine alias used by the shared auth utils (strapi.query(uid)).
    query: dbQueryAdapter,
    documents,
    entityService: entityServiceAdapter(),
    eventHub: new EventEmitter(),
    apiPro: {
      cache: createCache(config.cache),
      roleProviders: [],
      registerRoleProvider(fn) {
        if (typeof fn !== 'function') throw new Error('[api-pro] registerRoleProvider expects a function');
        strapi.apiPro.roleProviders.push(fn);
      },
    },
    log: {
      info: (...a) => console.log('[core]', ...a),
      warn: (...a) => console.warn('[core]', ...a),
      error: (...a) => console.error('[core]', ...a),
      debug: () => {},
    },
  };
  strapi.service = createServiceResolver(strapi);
  // Ported pos-strapi files reference the bare `strapi` global, exactly as
  // they do under Strapi (which sets it the same way).
  global.strapi = strapi;
  return strapi;
}

/** The api-pro plugin's own runtime services, loaded from their source of truth. */
function loadApiProServices() {
  return {
    context: require(path.join(PLUGIN_ROOT, 'services', 'context.js')),
    interceptor: require(path.join(PLUGIN_ROOT, 'services', 'request-interceptor.js')),
    engine: require(path.join(PLUGIN_ROOT, 'services', 'permission-engine.js')),
    resolver: require(path.join(PLUGIN_ROOT, 'services', 'policy-resolver.js')),
    mePermissions: require(path.join(PLUGIN_ROOT, 'services', 'me-permissions.js')),
  };
}

module.exports = { buildCompatStrapi, loadApiProServices, createCache, posRequire, instantiateController };
