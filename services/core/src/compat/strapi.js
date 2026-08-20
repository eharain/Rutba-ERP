'use strict';

/**
 * `strapi`-shaped compatibility object so PORTED SOURCE FILES run inside
 * services/core unmodified:
 *
 *  - the api-pro plugin's own services (packages/strapi-api-pro/server/src/*)
 *  - services/strapi module code (controllers / services / state machines /
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
 *   strapi.service(uid)                   → services/strapi service modules, instantiated
 *                                           against this compat object
 *   strapi.apiPro.cache                   → TTL cache (get/set/clearUser/clearAll)
 *   strapi.posting                        → ERP Core posting router + export queue
 *                                           (undefined under real Strapi — see below)
 *   strapi.log / strapi.eventHub          → console logger / plain EventEmitter
 *
 * buildCompatStrapi() also assigns `global.strapi` — ported services/strapi files
 * reference the bare `strapi` global exactly as they do under Strapi.
 */

const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { REPO_ROOT, get: envGet } = require('../config/env');
const { withTransaction, getDb } = require('../db/connection');
const { documents, getRegistry } = require('../documents');
const { applyFilters } = require('../documents/query');
const { emailService } = require('../platform/email');

const PLUGIN_ROOT = path.join(REPO_ROOT, 'packages', 'strapi-api-pro', 'server', 'src');
const POS_SRC = path.join(REPO_ROOT, 'services/strapi', 'src');
const pluginConfig = require(path.join(PLUGIN_ROOT, 'config.js'));

/**
 * Seed require.cache with a stub for '@strapi/strapi' (as resolved from
 * services/strapi's node_modules) BEFORE any services/strapi source file is required.
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
    return; // services/strapi deps absent — service loading will fail visibly later
  }
  if (require.cache[resolved]) return; // real module already loaded — leave it
  const marker = (kind) => (uid, cfg) => ({ __rutbaCoreFactory: kind, uid, cfg });
  const factories = {
    createCoreService: marker('service'),
    createCoreController: marker('controller'),
    // Router stub exposes the five CRUD routes Strapi generates, because
    // several services/strapi route files build their export as
    // `[...customRoutes, ...defaultRouter.routes]` — without a real array
    // there, requiring those files throws and their custom routes are
    // invisible to tooling (route-audit.js reads them this way).
    createCoreRouter: (uid, cfg) => ({
      __rutbaCoreFactory: 'router',
      uid,
      cfg,
      get routes() {
        let plural = null;
        try { plural = (getRegistry().models.get(uid) || {}).pluralName; } catch { /* registry unavailable */ }
        if (!plural) return [];
        return [
          { method: 'GET', path: `/${plural}`, handler: `${uid}.find` },
          { method: 'POST', path: `/${plural}`, handler: `${uid}.create` },
          { method: 'GET', path: `/${plural}/:documentId`, handler: `${uid}.findOne` },
          { method: 'PUT', path: `/${plural}/:documentId`, handler: `${uid}.update` },
          { method: 'DELETE', path: `/${plural}/:documentId`, handler: `${uid}.delete` },
        ];
      },
    }),
  };
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: { factories },
  };
}

/** Require a services/strapi source file (controllers, services, utils, …). */
function posRequire(relPath) {
  installStrapiFactoryStub();
  return require(path.join(POS_SRC, relPath));
}

/**
 * Strapi-style env helper for evaluating services/strapi config factories
 * (config/social.js etc.). Name resolution goes through core's env loader, so
 * the POS_STRAPI__ prefix convention keeps working (workspace-env parity).
 */
function makeEnvHelper() {
  const env = (name, fallback) => {
    const v = envGet(name);
    return v === undefined ? fallback : v;
  };
  env.bool = (name, fallback) => {
    const v = envGet(name);
    if (v === undefined) return fallback;
    return v === true || String(v).toLowerCase() === 'true' || v === '1';
  };
  env.int = (name, fallback) => {
    const v = envGet(name);
    if (v === undefined) return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  };
  env.array = (name, fallback = []) => {
    const v = envGet(name);
    if (v === undefined) return fallback;
    return String(v).split(',').map((s) => s.trim()).filter(Boolean);
  };
  return env;
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
    let value = v;
    if (s.type === 'json' && value !== null && typeof value !== 'string') value = JSON.stringify(value);
    // MySQL DATETIME rejects raw ISO 'T…Z' strings — same normalization as
    // the documents write path.
    if (s.type === 'datetime' && typeof value === 'string' && !Number.isNaN(Date.parse(value))) value = new Date(value);
    values[s.column] = value;
  }
  return values;
}

/**
 * Split a query-engine `data` payload into scalar column values and owner-side
 * XtoOne relation writes given as a bare id or null (the query-engine dialect —
 * e.g. crm-lead `{ assigned_to: userId }`). Anything else still throws via
 * scalarWriteValues.
 */
function splitWriteValues(reg, model, data) {
  const scalars = {};
  const relations = [];
  for (const [attr, v] of Object.entries(data || {})) {
    const rel = model.relations.find((r) => r.attr === attr);
    const isToOne = rel && rel.owner && (rel.relation === 'manyToOne' || rel.relation === 'oneToOne');
    const isIdish = v === null || typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v));
    if (isToOne && isIdish) {
      const jt = reg.joinTables.find((j) => j.ownerUid === model.uid && j.attr === attr);
      if (jt) { relations.push({ jt, targetId: v === null ? null : Number(v) }); continue; }
    }
    Object.assign(scalars, scalarWriteValues(model, { [attr]: v }));
  }
  return { scalars, relations };
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
      const { scalars, relations } = splitWriteValues(reg, model, data);
      scalars.updated_at = new Date();
      await getDb()(model.tableName).where('id', ids[0]).update(scalars);
      // Owner-side XtoOne link replacement — like Strapi's query engine,
      // direct and lifecycle-free.
      for (const { jt, targetId } of relations) {
        await getDb()(jt.table).where(jt.sourceColumn, ids[0]).del();
        if (targetId !== null) {
          await getDb()(jt.table).insert({ [jt.sourceColumn]: ids[0], [jt.targetColumn]: targetId });
        }
      }
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
        ...(opts.fields !== undefined ? { fields: opts.fields } : {}),
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
 * strapi.service(uid) resolver: loads the services/strapi service module for
 * `api::<apiName>.<serviceName>` from services/strapi/src/api/<apiName>/services/,
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

// Attribute metadata for one registry model, in Strapi's schema shape. Scalars
// carry `enum`/`default` when the schema declared them — the /enums/:name/:field
// route returns attr.enum verbatim, and pos-shared's EnumSelect is empty without
// it.
function compatAttributes(model) {
  const attributes = {};
  for (const s of model.scalars) {
    const attr = { type: s.type };
    if (s.enum) attr.enum = s.enum;
    if (s.default !== undefined) attr.default = s.default;
    attributes[s.attr] = attr;
  }
  for (const r of model.relations) attributes[r.attr] = { type: 'relation', relation: r.relation, target: r.target };
  for (const m of model.media) attributes[m.attr] = { type: 'media', multiple: m.multiple };
  for (const c of model.components) attributes[c.attr] = { type: 'component', component: c.component, repeatable: c.repeatable };
  return attributes;
}

/**
 * The posting surface, bound to the process-wide entitlement resolver so the
 * router and the HTTP gate can never disagree about the same licence.
 *
 * Required lazily: posting.service pulls in the shared contract, and loading it
 * while the compat object is still being assembled would run that import inside
 * every consumer of this module, including the ones that never post.
 */
function buildPostingSurface() {
  let service = null;
  let resolver = null;
  const load = () => {
    if (!service) service = require('../domain/posting/posting.service');
    if (!resolver) resolver = require('../platform/entitlement-resolver').getEntitlementResolver();
    return service;
  };
  return {
    capture: (entry, options = {}) => load().capture(entry, { resolver, ...options }),
    enqueue: (entry, discriminator) => load().enqueue(entry, discriminator),
    listPending: (options) => load().listPending(options),
    pendingSummary: () => load().pendingSummary(),
    markResolved: (ids, status, error) => load().markResolved(ids, status, error),
    voidBySource: (sourceType, sourceId) => load().voidBySource(sourceType, sourceId),
    isLedgerEntitled: (orgId) => load().isLedgerEntitled(resolver, orgId),
  };
}

function buildCompatStrapi(overrides = {}) {
  installStrapiFactoryStub();
  const config = { ...pluginConfig.default, ...(overrides.apiProConfig || {}) };
  let socialConfig; // lazy — evaluated from services/strapi's own config factory
  let uploadConfig; // ditto, from config/plugins.js's `upload` block
  let contentTypesCache = null;
  let componentsCache = null;
  const strapi = {
    config: {
      get(key, fallback) {
        if (key === 'plugin::api-pro') return config;
        if (key === 'social') {
          if (socialConfig === undefined) {
            const factory = require(path.join(REPO_ROOT, 'services/strapi', 'config', 'social.js'));
            socialConfig = factory({ env: makeEnvHelper() });
          }
          return socialConfig;
        }
        // Upload provider choice + options. Read from services/strapi's own
        // config/plugins.js rather than re-derived from env here, so core can
        // never disagree with Strapi about where the bytes land.
        if (key === 'plugin::upload' || key.startsWith('plugin::upload.')) {
          if (uploadConfig === undefined) {
            const factory = require(path.join(REPO_ROOT, 'services/strapi', 'config', 'plugins.js'));
            const plugins = factory({ env: makeEnvHelper() }) || {};
            uploadConfig = ((plugins.upload || {}).config) || {};
          }
          if (key === 'plugin::upload') return uploadConfig;
          const sub = key.slice('plugin::upload.'.length);
          return uploadConfig[sub] !== undefined ? uploadConfig[sub] : fallback;
        }
        // config/server.js subset ported code reads (absolute media URLs, …).
        if (key === 'server.url') return envGet('PUBLIC_URL', '');
        if (key === 'server') return { url: envGet('PUBLIC_URL', '') };
        return fallback;
      },
    },
    // @strapi/provider-upload-local writes under dirs.static.public/uploads,
    // and PUBLIC_DIR moves that off services/strapi/public in this deployment.
    get dirs() {
      const pub = path.resolve(REPO_ROOT, 'services/strapi', envGet('PUBLIC_DIR', './public'));
      return { public: pub, static: { public: pub } };
    },
    // Attribute metadata view over the registry — enough for ported code that
    // introspects types (cms-bulk's Excel coercion, draftAndPublish checks).
    get contentTypes() {
      if (!contentTypesCache) {
        contentTypesCache = {};
        for (const [uid, model] of getRegistry().models) {
          if (model.isComponent) continue;
          contentTypesCache[uid] = {
            uid,
            // `info` carries the names ported lookups fall back on when a caller
            // passes a short name whose uid isn't api::<name>.<name> (plugin
            // content-types, any api where uid !== singularName).
            info: { singularName: model.singularName, pluralName: model.pluralName },
            attributes: compatAttributes(model),
            options: { draftAndPublish: model.draftAndPublish },
          };
        }
      }
      return contentTypesCache;
    },
    // Component schemas keyed by `category.name`, as Strapi keys them. Ported
    // schema lookups fall through to this map when a name is not a content type
    // (enums, validator); without it that tail read threw instead of 404ing.
    get components() {
      if (!componentsCache) {
        componentsCache = {};
        for (const [uid, model] of getRegistry().models) {
          if (!model.isComponent) continue;
          componentsCache[uid] = { uid, attributes: compatAttributes(model) };
        }
      }
      return componentsCache;
    },
    db: {
      query: dbQueryAdapter,
      // Caller-scoped transaction: shim ops inside the callback join it (ALS).
      transaction: (cb) => withTransaction((trx) => cb({ trx })),
      get connection() { return getDb(); },
      // Strapi's db.metadata surface, backed by the registry. Ported code uses
      // it for raw-knex query building: tableName, scalar columnName, and the
      // relation joinTable layout (stock-item valuation/cohort queries).
      metadata: {
        get(uid) {
          const reg = getRegistry();
          const model = reg.models.get(uid);
          if (!model) throw new Error(`compat: db.metadata has no model ${uid}`);
          const attributes = {
            documentId: { columnName: 'document_id' },
            createdAt: { columnName: 'created_at' },
            updatedAt: { columnName: 'updated_at' },
            publishedAt: { columnName: 'published_at' },
          };
          for (const s of model.scalars) attributes[s.attr] = { columnName: s.column, type: s.type };
          for (const r of model.relations) {
            let jt = reg.joinTablesByOwner.get(`${uid}.${r.attr}`);
            let joinTable = null;
            if (jt) {
              joinTable = {
                name: jt.table,
                joinColumn: { name: jt.sourceColumn },
                inverseJoinColumn: { name: jt.targetColumn },
                orderColumnName: jt.ownerOrdColumn,
              };
            } else if (r.mappedBy) {
              // Inverse side: the owner's join table viewed from this end.
              jt = reg.joinTablesByOwner.get(`${r.target}.${r.mappedBy}`);
              if (jt) {
                joinTable = {
                  name: jt.table,
                  joinColumn: { name: jt.targetColumn },
                  inverseJoinColumn: { name: jt.sourceColumn },
                  orderColumnName: jt.inverseOrdColumn,
                };
              }
            }
            attributes[r.attr] = { type: 'relation', relation: r.relation, target: r.target, ...(joinTable ? { joinTable } : {}) };
          }
          return { uid, tableName: model.tableName, attributes };
        },
      },
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
    /**
     * ERP Core posting (portal task E1 × E2), exposed to ported services/strapi code.
     *
     * A ported controller cannot require services/core — core requires services/strapi,
     * and inverting that would be a cycle. So the capability arrives the same
     * way `apiPro` does: attached here, and ABSENT when the same file runs
     * under real Strapi. Callers must treat undefined as "post as you always
     * did", which is what makes wiring an emitter additive rather than a
     * flag day.
     */
    posting: buildPostingSurface(),
    log: {
      info: (...a) => console.log('[core]', ...a),
      warn: (...a) => console.warn('[core]', ...a),
      error: (...a) => console.error('[core]', ...a),
      debug: () => {},
    },
    // Strapi plugins are not loaded in core. `email` is reproduced by
    // platform/email.js because ported call sites (notification-engine,
    // sale-order/notification-service) send through it unchanged. Every other
    // name still throws: those call sites wrap in try/catch, and an explicit
    // error beats a TypeError on undefined.
    plugin(name) {
      if (name === 'email') return { service: () => emailService };
      if (name === 'upload') {
        // Lazily required: platform/upload pulls in sharp and the configured
        // provider, and nothing should pay for that until a file moves.
        const up = require('../platform/upload');
        const services = {
          upload: up.uploadService,
          folder: up.folderService,
          file: up.fileService,
          'image-manipulation': up.imageManipulation,
        };
        return {
          get provider() { return up.getProvider(); },
          service(serviceName) {
            const svc = services[serviceName];
            if (!svc) {
              throw new Error(`compat: strapi.plugin('upload').service('${serviceName}') is not implemented`);
            }
            return svc;
          },
        };
      }
      if (name === 'users-permissions') {
        // Ported controllers on auth:false routes identify the caller through
        // this handle (cash-register, sale/search-by-*, reorder-policy), and
        // auth-admin creates/edits/deletes users through it. Backed by the same
        // services core's own auth module uses, so there is one implementation.
        const { userService, upJwt } = require('../auth/up');
        const services = { user: userService, jwt: upJwt };
        return {
          service(serviceName) {
            const svc = services[serviceName];
            if (!svc) {
              throw new Error(
                `compat: strapi.plugin('users-permissions').service('${serviceName}') is not implemented`
              );
            }
            return svc;
          },
        };
      }
      if (name === 'api-pro') {
        // The plugin's services are plain modules taking (strapi, …), already
        // loaded piecemeal by loadApiProServices for the interceptor. Exposed
        // under the plugin handle too, because the seeders reach for them that
        // way (src/seed/api-provider-seed.js → plugin.service('seeder')).
        return {
          service(serviceName) {
            const file = path.join(PLUGIN_ROOT, 'services', `${serviceName}.js`);
            if (!fs.existsSync(file)) {
              throw new Error(`compat: strapi.plugin('api-pro').service('${serviceName}') not found`);
            }
            // eslint-disable-next-line global-require, import/no-dynamic-require
            return require(file);
          },
          config: (key, fallback) => (key ? (config[key] ?? fallback) : config),
        };
      }
      throw new Error(`compat: strapi.plugin('${name}') is not available in services/core`);
    },
  };
  strapi.service = createServiceResolver(strapi);
  // Ported services/strapi files reference the bare `strapi` global, exactly as
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
