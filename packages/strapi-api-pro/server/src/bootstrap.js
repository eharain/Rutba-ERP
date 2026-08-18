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
//   3. Install the documents-service filter enforcer (policy enforcement
//      itself runs as a per-route middleware — see register.js and
//      middlewares/enforce.js).
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

// ── Documents-service policy enforcer ───────────────────────────────────────
// Companion to the per-route enforce middleware (middlewares/enforce.js, which
// register.js injects into every content-api route). The route middleware
// resolves the claim + policy and stashes the resolved fragment on
// ctx.state.apiProPolicy — but for core CRUD actions it deliberately keeps the
// filter fragment OUT of ctx.query and the body fragment OUT of
// ctx.request.body, because Strapi's core controllers run both through
// contentAPI.validate/sanitize, which 400s on / strips private and restricted
// attributes (createdBy, user relations like `owners`) that scoping templates
// reference. This documents middleware applies those fragments post-sanitize,
// where they are server-trusted, for the content-type the route targets:
//   • filters on the read/delete actions below;
//   • body stamps (ownership like `{ owners: $user.id }`) merged into
//     params.data on create/update.
//
// `update` is absent from the filter action set on purpose: Strapi's
// documents.update ignores filter params (pickSelectionParams), and
// restricting its entry lookup would trigger the update-or-recreate fallback.
const DOC_FILTERED_ACTIONS = new Set(['findMany', 'findFirst', 'findOne', 'count', 'delete']);
const DOC_BODY_STAMPED_ACTIONS = new Set(['create', 'update']);

function installDocumentsPolicyEnforcer(strapi) {
  const config = strapi.config.get('plugin::api-pro') || {};
  if (config.interceptorEnabled === false) {
    strapi.log.info('[api-pro] interceptor disabled by config');
    return;
  }

  if (typeof strapi.documents?.use !== 'function') {
    strapi.log.error('[api-pro] strapi.documents.use unavailable — policy filter fragments will not be enforced on core routes');
    return;
  }

  const { deepMerge } = require('./services/request-interceptor');

  strapi.documents.use((docCtx, next) => {
    const reqCtx = strapi.requestContext?.get?.();
    const route = reqCtx?.state?.apiProRoute;
    if (!route || route.contentTypeUid !== docCtx.uid) return next();

    if (DOC_BODY_STAMPED_ACTIONS.has(docCtx.action)) {
      const body = reqCtx?.state?.apiProPolicy?.body;
      if (body && typeof body === 'object' && Object.keys(body).length > 0) {
        const params = docCtx.params || (docCtx.params = {});
        params.data = deepMerge(
          params.data && typeof params.data === 'object' ? params.data : {},
          body
        );
      }
      return next();
    }

    if (!DOC_FILTERED_ACTIONS.has(docCtx.action)) return next();

    const filters = reqCtx?.state?.apiProPolicy?.filters;
    if (!filters || typeof filters !== 'object' || Object.keys(filters).length === 0) {
      return next();
    }

    const params = docCtx.params || (docCtx.params = {});
    const existing = params.filters;
    const hasExisting = Array.isArray(existing)
      ? existing.length > 0
      : existing && typeof existing === 'object' && Object.keys(existing).length > 0;
    params.filters = hasExisting ? { $and: [existing, filters] } : filters;
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
    // services/strapi (or any consumer) calls this from its own bootstrap to inject
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
  installDocumentsPolicyEnforcer(strapi);
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
