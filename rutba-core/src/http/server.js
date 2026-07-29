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
const { buildCompatStrapi, loadApiProServices } = require('../compat/strapi');
const { initModules } = require('../modules');
const { createAuthMiddleware } = require('./auth');

const CORE_ACTIONS = new Set(['find', 'findOne', 'create', 'update', 'delete']);

function sendError(ctx, status, name, message, details) {
  ctx.status = status;
  ctx.body = { data: null, error: { status, name, message, ...(details !== undefined ? { details } : {}) } };
}

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

function restStatus(model, query) {
  // REST default is 'published' — and it applies to POPULATE TARGETS even when
  // the parent type itself is not draftAndPublish (applyStatus no-ops on the
  // parent; D&P children resolve to their published versions).
  return query.status === 'draft' ? 'draft' : 'published';
}

function coreHandler(uid, action) {
  const reg = getRegistry();
  const model = reg.models.get(uid);
  return async (ctx) => {
    const q = ctx.query || {};
    const docs = documents(uid);
    const status = restStatus(model, q);

    if (action === 'find') {
      const page = Math.max(1, parseInt((q.pagination && q.pagination.page) || 1, 10));
      const pageSize = Math.min(500, Math.max(1, parseInt((q.pagination && q.pagination.pageSize) || 25, 10)));
      const params = { filters: q.filters, populate: q.populate, sort: q.sort, status, page, pageSize };
      const [rows, total] = await Promise.all([
        docs.findMany(params),
        docs.count({ filters: q.filters, status }),
      ]);
      ctx.body = {
        data: rows,
        meta: { pagination: { page, pageSize, pageCount: Math.ceil(total / pageSize), total } },
      };
      return;
    }
    if (action === 'findOne') {
      const row = await docs.findOne({ documentId: ctx.params.documentId, populate: q.populate, status });
      if (!row) return sendError(ctx, 404, 'NotFoundError', 'Not Found');
      ctx.body = { data: row, meta: {} };
      return;
    }
    if (action === 'create') {
      const data = (ctx.request.body && ctx.request.body.data) || {};
      const row = await docs.create({ data, status, populate: q.populate });
      ctx.status = 201;
      ctx.body = { data: row, meta: {} };
      return;
    }
    if (action === 'update') {
      const data = (ctx.request.body && ctx.request.body.data) || {};
      const row = await docs.update({ documentId: ctx.params.documentId, data, status, populate: q.populate });
      if (!row) return sendError(ctx, 404, 'NotFoundError', 'Not Found');
      ctx.body = { data: row, meta: {} };
      return;
    }
    if (action === 'delete') {
      await docs.delete({ documentId: ctx.params.documentId });
      ctx.status = 204;
      return;
    }
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

  router.get('/_health', (ctx) => { ctx.body = { status: 'ok', server: 'rutba-core' }; });

  // Prefix-matched bypass paths (same semantics as api-pro's bootstrap matcher):
  // these skip policy enforcement, and — when unauthenticated — skip auth too.
  const cfg = strapi.config.get('plugin::api-pro') || {};
  const bypassPrefixes = (cfg.bypassPaths || []).map((p) => String(p).replace(/\/+$/, ''));
  const isBypassed = (p) => bypassPrefixes.some((b) => p === b || p.startsWith(`${b}/`));

  const auth = createAuthMiddleware({ isBypassed });

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
      return r.handler(ctx);
    };
    if (r.selfAuth) {
      // auth:false in Strapi — the controller gates itself (ensureUser /
      // requireAppRole); the interceptor never ran there, so it doesn't here.
      router[r.method](r.path, auth, handler);
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
