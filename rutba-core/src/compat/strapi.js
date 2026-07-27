'use strict';

/**
 * Thin `strapi`-shaped compatibility object so the api-pro plugin's OWN
 * service modules (packages/strapi-api-pro/server/src/services/*) run inside
 * rutba-core unmodified. Surface implemented = surface those services use:
 *
 *   strapi.config.get('plugin::api-pro')  → merged plugin config
 *   strapi.db.query(uid).findOne/findMany({ where, populate, select })
 *   strapi.documents(uid)                 → the shim
 *   strapi.apiPro.cache                   → TTL cache (get/set/clearUser/clearAll)
 *   strapi.log                            → console-backed logger
 */

const path = require('path');
const { REPO_ROOT } = require('../config/env');
const { withTransaction } = require('../db/connection');
const { documents, getRegistry } = require('../documents');

const PLUGIN_ROOT = path.join(REPO_ROOT, 'packages', 'strapi-api-pro', 'server', 'src');
const pluginConfig = require(path.join(PLUGIN_ROOT, 'config.js'));

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

/** Drop populate keys the (possibly partial) model doesn't declare. */
function sanitizePopulate(model, populate, reg) {
  if (!populate || typeof populate !== 'object' || Array.isArray(populate)) return populate;
  const known = new Set([
    ...model.relations.map((r) => r.attr),
    ...model.media.map((m) => m.attr),
    ...model.components.map((c) => c.attr),
  ]);
  const out = {};
  for (const [attr, opts] of Object.entries(populate)) {
    if (!known.has(attr)) continue;
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

/** db.query(uid) adapter: `where` maps straight onto the shim filter dialect. */
function dbQueryAdapter(uid) {
  const reg = getRegistry();
  const model = reg.models.get(uid);
  if (!model) throw new Error(`compat db.query: unknown uid ${uid}`);
  const docs = documents(uid);
  const toParams = ({ where, populate } = {}) => ({
    filters: where || {},
    populate: sanitizePopulate(model, populate, reg),
  });
  return {
    findOne: async (opts = {}) => docs.findFirst(toParams(opts)),
    findMany: async (opts = {}) => docs.findMany(toParams(opts)),
    count: async (opts = {}) => docs.count({ filters: (opts && opts.where) || {} }),
  };
}

function buildCompatStrapi(overrides = {}) {
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
    },
    documents,
    apiPro: { cache: createCache(config.cache), roleProviders: [] },
    log: {
      info: (...a) => console.log('[core]', ...a),
      warn: (...a) => console.warn('[core]', ...a),
      error: (...a) => console.error('[core]', ...a),
      debug: () => {},
    },
  };
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

module.exports = { buildCompatStrapi, loadApiProServices, createCache };
