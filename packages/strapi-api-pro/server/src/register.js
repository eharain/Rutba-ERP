'use strict';

const { extendUserRelation } = require('./content-types/app-role');

const ENFORCE_MW = 'plugin::api-pro.enforce';

function injectRoute(route) {
  if (!route || typeof route !== 'object') return;
  route.config = route.config || {};
  const existing = Array.isArray(route.config.middlewares) ? route.config.middlewares : [];
  if (existing.includes(ENFORCE_MW)) return;
  route.config.middlewares = [ENFORCE_MW, ...existing];
}

// Mutate a router entry in its map so the enforce middleware ends up first in
// every route's config.middlewares. Core routers (createCoreRouter) expose a
// memoizing `routes` getter — accessing it here caches the array, and
// initRouting later sees the same (mutated) objects. Function-style routers
// are instantiated by Strapi at initRouting, so those get wrapped instead.
function injectRouterInPlace(map, key, { contentApiOnly }) {
  const router = map[key];
  if (!router) return;

  if (typeof router === 'function') {
    map[key] = (args) => {
      const built = router(args);
      if (built && (!contentApiOnly || built.type === 'content-api')) {
        (Array.isArray(built.routes) ? built.routes : []).forEach(injectRoute);
      }
      return built;
    };
    return;
  }

  if (contentApiOnly && router.type !== 'content-api') return;
  const routes = router.routes;
  if (Array.isArray(routes)) routes.forEach(injectRoute);
}

// Runs in the plugin REGISTER phase — before Strapi's initRouting composes
// each endpoint — so the enforce middleware lands INSIDE every content-api
// route's stack, after authenticate/authorize. This replaces the old global
// `strapi.server.use` interceptor from bootstrap, which ran BEFORE route
// dispatch (Strapi mounts the router at listen()) and therefore never saw
// ctx.state.user / ctx.state.route — silently disabling all enforcement.
function injectEnforceMiddleware(strapi) {
  // App apis: registerAPIRoutes forces router.type = 'content-api', so every
  // router here is content-api regardless of what the file declares.
  for (const apiName of Object.keys(strapi.apis || {})) {
    const api = strapi.apis[apiName];
    if (!api || typeof api.routes !== 'object' || Array.isArray(api.routes)) continue;
    for (const key of Object.keys(api.routes)) {
      injectRouterInPlace(api.routes, key, { contentApiOnly: false });
    }
  }

  // Plugin routes: only content-api routers. The array form is mounted under
  // the admin api, and api-pro's own routes guard themselves (appContext /
  // admin::hasPermissions).
  for (const pluginName of Object.keys(strapi.plugins || {})) {
    if (pluginName === 'api-pro') continue;
    const plugin = strapi.plugins[pluginName];
    const routers = plugin?.routes;
    if (!routers || typeof routers !== 'object' || Array.isArray(routers)) continue;
    for (const key of Object.keys(routers)) {
      injectRouterInPlace(routers, key, { contentApiOnly: true });
    }
  }
}

module.exports = ({ strapi }) => {
  try {
    extendUserRelation(strapi);
  } catch (err) {
    strapi.log.error('[api-pro] Failed to extend user content-type:', err.message);
  }

  try {
    injectEnforceMiddleware(strapi);
  } catch (err) {
    strapi.log.error(`[api-pro] Failed to inject enforce middleware into routes: ${err.message}`);
  }
};
