'use strict';

// Bootstrap runs after DB schema sync. By this point the user-schema patch
// from register.js has already produced the `app_roles` join table, and all
// content-types in this plugin are queryable.
//
// What bootstrap is responsible for:
//   1. Install an in-memory permission cache (LRU with TTL).
//   2. Expose a global `strapi.apiPro` service registry. Other plugins /
//      extensions reach into this namespace to trigger cache invalidation
//      when roles or policies change.
//   3. Mount the global request interceptor as a Koa middleware.
//   4. Trigger file↔DB sync of interfaces/policies.
//   5. Wire content-type lifecycle hooks so cache invalidates when an app-role,
//      app-domain, or method-policy is created / updated / deleted.

const TTL_DEFAULT_MS = 30_000;
const MAX_ENTRIES_DEFAULT = 5_000;

// ── Permission cache (LRU + TTL) ────────────────────────────────────────────
function createPermissionCache({ ttlMs = TTL_DEFAULT_MS, maxEntries = MAX_ENTRIES_DEFAULT } = {}) {
  const store = new Map();

  function get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      store.delete(key);
      return undefined;
    }
    // touch (LRU)
    store.delete(key);
    store.set(key, entry);
    return entry.value;
  }

  function set(key, value) {
    if (store.has(key)) store.delete(key);
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (store.size > maxEntries) {
      const oldestKey = store.keys().next().value;
      store.delete(oldestKey);
    }
  }

  function clearUser(userId) {
    const prefix = `u:${userId}:`;
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  }

  function clearAll() {
    store.clear();
  }

  return {
    get,
    set,
    clearUser,
    clearAll,
    size: () => store.size,
  };
}

// ── Bypass-path helper ──────────────────────────────────────────────────────
function buildBypassMatcher(paths = []) {
  const list = paths.filter((p) => typeof p === 'string' && p.length > 0);
  return (path) => {
    if (!path) return false;
    for (const prefix of list) {
      if (path === prefix || path.startsWith(`${prefix}/`)) return true;
    }
    return false;
  };
}

// ── Admin RBAC permission actions ───────────────────────────────────────────
// Routes in server/src/routes/index.js are gated by `admin::hasPermissions`
// against these two action UIDs. Registering them here makes them appear in
// Settings → Administration → Roles → [role] → Plugins → API Pro, where an
// admin can grant them per-role. Super Admin is auto-granted.
async function registerAdminPermissions(strapi) {
  try {
    const actionProvider = strapi.service('admin::permission')?.actionProvider;
    if (!actionProvider?.registerMany) {
      strapi.log.warn('[api-pro] admin permission actionProvider unavailable — RBAC not registered');
      return;
    }
    await actionProvider.registerMany([
      {
        section: 'plugins',
        displayName: 'Read',
        uid: 'read',
        pluginName: 'api-pro',
      },
      {
        section: 'plugins',
        displayName: 'Write',
        uid: 'write',
        pluginName: 'api-pro',
      },
    ]);
  } catch (error) {
    strapi.log.warn(`[api-pro] failed to register admin permission actions: ${error?.message}`);
  }
}

// ── Cache invalidation lifecycle wiring ─────────────────────────────────────
function registerCacheInvalidationHooks(strapi) {
  const invalidate = () => strapi.apiPro?.cache?.clearAll?.();

  const targets = [
    'plugin::api-pro.app-role',
    'plugin::api-pro.app-domain',
    'plugin::api-pro.api-method-policy',
  ];

  for (const uid of targets) {
    try {
      strapi.db.lifecycles.subscribe({
        models: [uid],
        afterCreate: invalidate,
        afterUpdate: invalidate,
        afterDelete: invalidate,
        afterCreateMany: invalidate,
        afterUpdateMany: invalidate,
        afterDeleteMany: invalidate,
      });
    } catch (error) {
      strapi.log.warn(`[api-pro] failed to subscribe lifecycle for ${uid}: ${error?.message}`);
    }
  }
}

// ── Global interceptor ──────────────────────────────────────────────────────
// Runs on every request. Skips bypassed paths and unauthenticated requests
// (users-permissions middleware runs before this and populates ctx.state.user).
// For authenticated requests with a recognized route handler, delegates to
// the request-interceptor service which resolves policies, merges templates,
// and mutates ctx.query / ctx.request.body in place.
function installInterceptor(strapi) {
  const config = strapi.config.get('plugin::api-pro') || {};
  if (config.interceptorEnabled === false) {
    strapi.log.info('[api-pro] interceptor disabled by config');
    return;
  }

  const isBypassed = buildBypassMatcher(config.bypassPaths);
  const interceptor = require('./services/request-interceptor');

  strapi.server.use(async (ctx, next) => {
    if (isBypassed(ctx.path)) {
      return next();
    }

    try {
      const result = await interceptor.process(ctx, strapi);

      if (result.status === 'denied') {
        ctx.status = 403;
        ctx.body = {
          error: {
            code: 'API_PRO_FORBIDDEN',
            message: result.reason || 'Request denied by api-pro policy',
          },
        };
        return;
      }
    } catch (error) {
      // Fail open with a loud log: a broken interceptor must not break the
      // entire site. Production should monitor this log line.
      strapi.log.error(`[api-pro] interceptor error on ${ctx.method} ${ctx.path}: ${error?.stack || error?.message}`);
    }

    return next();
  });
}

module.exports = async ({ strapi }) => {
  const config = strapi.config.get('plugin::api-pro') || {};

  const cache = createPermissionCache(config.cache || {});
  const roleProviders = [];

  // The registry itself is frozen so consumers can't reshape its surface,
  // but roleProviders is a live array reachable through the freeze (Object.freeze
  // is shallow — mutating a referenced array is still allowed).
  strapi.apiPro = Object.freeze({
    cache,
    roleProviders,
    getConfig: () => strapi.config.get('plugin::api-pro') || {},
    isBypassed: buildBypassMatcher(config.bypassPaths),
    clearCache: (userId) => (userId ? cache.clearUser(userId) : cache.clearAll()),
    clearAllCache: () => cache.clearAll(),
    // pos-strapi (or any consumer) calls this from its own bootstrap to inject
    // additional role keys derived from external context — e.g. hr_* roles
    // pulled from HR team membership. The fn receives (user, { strapi }) and
    // should return an array of role-key strings.
    registerRoleProvider(fn) {
      if (typeof fn !== 'function') {
        throw new Error('[api-pro] registerRoleProvider expects a function');
      }
      roleProviders.push(fn);
    },
  });

  registerCacheInvalidationHooks(strapi);
  installInterceptor(strapi);
  await registerAdminPermissions(strapi);

  // Bring the DB mirror in line with the canonical .api-pro/ files. Fail open
  // on errors — a bad file shouldn't crash the entire Strapi boot.
  try {
    const sync = require('./services/sync');
    const result = await sync.syncAll(strapi);
    strapi.log.info(
      `[api-pro] file→DB sync ok (interfaces=${result.interfaces}, ` +
      `methods=${result.methods}, policies=${result.policies})`
    );
  } catch (error) {
    strapi.log.error(`[api-pro] file→DB sync failed: ${error?.stack || error?.message}`);
  }

  strapi.log.info(
    `[api-pro] bootstrap ok (enforcementMode=${config.enforcementMode || 'hybrid'}, ` +
    `denyByDefault=${config.denyByDefault !== false}, ` +
    `cacheTTL=${config.cache?.ttlMs || TTL_DEFAULT_MS}ms)`
  );
};
