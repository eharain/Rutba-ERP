'use strict';

/**
 * rutba-core HTTP layer: Koa server mounting descriptor-defined routes from
 * the api-pro DB mirror (api_pro_interfaces / api_pro_interface_methods),
 * gated by the api-pro interceptor running through the compat layer.
 *
 * Route handlers:
 *  - Core actions (find/findOne/create/update/delete) → documents() shim,
 *    Strapi REST envelope ({ data, meta }), REST status defaults
 *    (published for D&P types, drafts via ?status=draft).
 *  - Ported custom actions → module registry handlers (src/modules/*), mounted
 *    BEFORE the seeded table so they override rows seeded with core action
 *    names for the verb whitelist. `selfAuth` routes skip the api-pro
 *    interceptor (parity: auth:false in Strapi → interceptor never saw them;
 *    the controllers gate themselves).
 *  - Unported custom actions → 501 until their module's tranche.
 */

const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const qs = require('qs');
const { documents, getRegistry } = require('../documents');
const { get: envGet } = require('../config/env');
const { buildCompatStrapi, loadApiProServices } = require('../compat/strapi');
const { initModules } = require('../modules');
const { createAuthMiddleware } = require('./auth');
const { createCorsMiddleware } = require('./cors');
const { coreHandler, sendError } = require('./rest');

const CORE_ACTIONS = new Set(['find', 'findOne', 'create', 'update', 'delete']);

// Strapi assigns these statuses by error class; ported code throws them.
const ERROR_NAME_STATUS = {
  ValidationError: 400,
  ApplicationError: 400,
  BadRequestError: 400,
  UnauthorizedError: 401,
  ForbiddenError: 403,
  PolicyError: 403,
  NotFoundError: 404,
};
const STATUS_ERROR_NAME = {
  400: 'BadRequestError',
  401: 'UnauthorizedError',
  403: 'ForbiddenError',
  404: 'NotFoundError',
  500: 'InternalServerError',
  501: 'NotImplementedError',
};

/** Strapi-style ctx helpers the ported controllers call (ctx.badRequest, …). */
function installCtxHelpers(ctx) {
  const fail = (status, name) => (message, details) => {
    sendError(ctx, status, name, message || name, details);
  };
  ctx.badRequest = fail(400, 'BadRequestError');
  ctx.unauthorized = fail(401, 'UnauthorizedError');
  ctx.forbidden = fail(403, 'ForbiddenError');
  ctx.notFound = fail(404, 'NotFoundError');
  ctx.send = (body, status) => {
    if (status) ctx.status = status;
    ctx.body = body;
  };
}

/** Derive the mount path: stored paths carry literal 'undefined' where the
 *  descriptor interpolated a param (seeder calls descriptors argless). */
function mountPath(methodRow) {
  // Stored paths may carry a query-string tail from argless descriptor calls.
  const cleanPath = String(methodRow.path || '').split('?')[0];
  const base = `/api${cleanPath}`.replace(/\/+$/, '');
  let i = 0;
  const withParams = base.split('/').map((seg) =>
    seg === 'undefined' ? (i++ === 0 ? ':documentId' : `:p${i}`) : seg
  ).join('/');
  if (CORE_ACTIONS.has(methodRow.action) && methodRow.action !== 'find' && methodRow.action !== 'create'
      && !withParams.includes(':')) {
    return `${withParams}/:documentId`;
  }
  return withParams;
}

async function loadRouteTable() {
  const interfaces = await documents('plugin::api-pro.api-interface').findMany({
    populate: { methods: true },
  });
  const routes = [];
  for (const iface of interfaces) {
    for (const m of iface.methods || []) {
      routes.push({
        uid: iface.uid,
        action: m.action,
        verb: (m.method || 'get').toLowerCase(),
        path: mountPath(m),
        core: CORE_ACTIONS.has(m.action),
      });
    }
  }
  return routes;
}

async function buildServer() {
  const app = new Koa();
  const router = new Router();
  const strapi = buildCompatStrapi();
  const { interceptor } = loadApiProServices();
  const reg = getRegistry();

  // CORS runs outermost, so error responses carry the headers too — otherwise
  // the browser reports every 401/403/500 as an opaque CORS failure and the
  // real status never reaches the client's catch block.
  const { middleware: cors, origins: corsOrigins } = createCorsMiddleware();
  app.use(cors);

  app.use(async (ctx, next) => {
    try {
      installCtxHelpers(ctx);
      await next();
    } catch (err) {
      const status = err.status || ERROR_NAME_STATUS[err.name] || 500;
      const name = err.name && err.name !== 'Error'
        ? err.name
        : (STATUS_ERROR_NAME[status] || 'InternalServerError');
      if (status >= 500) console.error('[core] unhandled:', err.message);
      sendError(ctx, status, name, err.message, err.details);
    }
  });
  // Deep-parse the query string once and pin it, so api-pro's interceptor can
  // mutate ctx.query in place (Koa's default getter re-parses on each access).
  app.use(async (ctx, next) => {
    Object.defineProperty(ctx, 'query', {
      value: qs.parse(ctx.querystring, { depth: 10 }),
      writable: true,
      configurable: true,
    });
    await next();
  });
  app.use(bodyParser({ enableTypes: ['json'] }));
  // Strapi's includeUnparsed parity: expose the exact request bytes under the
  // same well-known symbol, for handlers that verify HMAC signatures over the
  // raw body (social webhooks).
  const UNPARSED = Symbol.for('unparsedBody');
  app.use(async (ctx, next) => {
    if (ctx.request.body && typeof ctx.request.body === 'object' && ctx.request.rawBody !== undefined) {
      ctx.request.body[UNPARSED] = ctx.request.rawBody;
    }
    return next();
  });

  router.get('/_health', (ctx) => { ctx.body = { status: 'ok', server: 'rutba-core' }; });

  // /uploads/* — every row in `files` stores a RELATIVE url (/uploads/…), and
  // the clients build an absolute one by prefixing IMAGE_URL, which
  // api-url-resolver derives from API_URL. So whichever server the apps point
  // at also has to answer for uploads.
  //
  // Strapi answers them from pos-strapi/public/uploads, but the configured
  // upload provider is strapi-provider-upload-media — the bytes live on
  // MEDIA_BASE_URL and that directory is empty, so those requests 404 there
  // too. Redirecting to the media host is what actually resolves them.
  // A 302 rather than a proxy: the media host already serves these with its own
  // caching, and core has no business streaming bytes it doesn't store.
  const mediaBaseUrl = String(envGet('MEDIA_BASE_URL', '') || '').replace(/\/+$/, '');
  router.get(/^\/uploads\/.+/, (ctx) => {
    if (!mediaBaseUrl) {
      return sendError(ctx, 404, 'NotFoundError',
        'uploads are served by MEDIA_BASE_URL, which is not configured');
    }
    ctx.redirect(`${mediaBaseUrl}${ctx.path}`);
  });

  // Prefix-matched bypass paths (same semantics as api-pro's bootstrap matcher):
  // these skip policy enforcement, and — when unauthenticated — skip auth too.
  const cfg = strapi.config.get('plugin::api-pro') || {};
  const bypassPrefixes = (cfg.bypassPaths || []).map((p) => String(p).replace(/\/+$/, ''));
  const isBypassed = (p) => bypassPrefixes.some((b) => p === b || p.startsWith(`${b}/`));

  const auth = createAuthMiddleware({ isBypassed });
  // For module selfAuth routes (auth:false in Strapi): identify when possible,
  // never reject — the controllers gate themselves (ensureUser & co).
  const authOptional = createAuthMiddleware({ isBypassed, optional: true });

  // /me/permissions — the login-time contract endpoint every app calls.
  // Ported straight from the plugin's me controller + mePermissions service.
  const { mePermissions } = loadApiProServices();
  const mePermissionsHandler = async (ctx) => {
    if (!ctx.state.user) {
      return sendError(ctx, 401, 'UnauthorizedError', 'Authenticated user required');
    }
    ctx.body = await mePermissions.build(strapi, ctx.state.user.id);
  };
  router.get('/api/me/permissions', auth, mePermissionsHandler);
  router.get('/api/api-pro/me/permissions', auth, mePermissionsHandler);

  const routes = await loadRouteTable();
  const seen = new Set();
  let mounted = 0; let custom = 0;

  // Module-registry custom routes mount FIRST: they claim their verb+path in
  // `seen` so seeded rows can't shadow them (some custom actions are seeded
  // with action 'create' and would otherwise mount as create handlers), and
  // literal paths (…/recompute) precede the seeded :documentId patterns.
  const { modules, routes: moduleRoutes } = initModules();
  let ported = 0;
  for (const r of moduleRoutes) {
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const handler = async (ctx) => {
      // Strapi routes for some modules name the param :id — alias it.
      if (ctx.params.documentId !== undefined && ctx.params.id === undefined) {
        ctx.params.id = ctx.params.documentId;
      }
      // Strapi assigns a controller's return value to ctx.body — mirror that
      // (several ported controllers `return { data }` instead of ctx.send).
      const result = await r.handler(ctx);
      if (result !== undefined && ctx.body === undefined) ctx.body = result;
    };
    if (r.selfAuth) {
      // auth:false in Strapi — the controller gates itself (ensureUser /
      // requireAppRole); the interceptor never ran there, so it doesn't here.
      router[r.method](r.path, authOptional, handler);
    } else {
      const gate = async (ctx, next) => {
        ctx.state.route = { handler: `${r.uid}.${r.action}` };
        if (ctx.state.user && !isBypassed(ctx.path)) {
          const result = await interceptor.process(ctx, strapi);
          if (result.status === 'denied') {
            return sendError(ctx, 403, 'PolicyError', result.reason);
          }
        }
        return next();
      };
      router[r.method](r.path, auth, gate, handler);
    }
    mounted++;
    ported++;
  }

  for (const route of routes) {
    const key = `${route.verb} ${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!reg.models.has(route.uid)) continue;

    const gate = async (ctx, next) => {
      // Same shape Strapi gives api-pro: route handler = "<uid>.<action>".
      ctx.state.route = { handler: `${route.uid}.${route.action}` };
      if (ctx.state.user && !isBypassed(ctx.path)) {
        const result = await interceptor.process(ctx, strapi);
        if (result.status === 'denied') {
          return sendError(ctx, 403, 'PolicyError', result.reason);
        }
      }
      // API-token requests carry no user → interceptor skipped (parity with pos-strapi).
      return next();
    };

    const handler = route.core
      ? coreHandler(route.uid, route.action)
      : async (ctx) => sendError(ctx, 501, 'NotPortedError',
          `${route.uid}.${route.action} is not ported to rutba-core yet`);

    router[route.verb](route.path, auth, gate, handler);
    mounted++;
    if (!route.core) custom++;
  }

  app.use(router.routes()).use(router.allowedMethods());
  console.log(`[core] mounted ${mounted} routes (modules: ${modules.join(', ')} — ${ported} custom ported; ${custom} custom → 501)`);
  console.log(`[core] cors: ${corsOrigins.length} allowed origin(s)`);
  return app;
}

async function start(port) {
  const app = await buildServer();
  const p = port || parseInt(require('../config/env').get('PORT', '4020'), 10);
  const server = app.listen(p);
  console.log(`[core] rutba-core listening on :${p}`);
  return server;
}

module.exports = { buildServer, start };
