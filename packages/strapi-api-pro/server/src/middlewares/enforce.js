'use strict';

// Per-route policy-enforcement middleware. register.js injects it into every
// content-api route so it runs INSIDE the composed route stack — after
// Strapi's authenticate/authorize — where ctx.state.user and ctx.state.route
// are populated.
//
// This placement is load-bearing: a middleware added via `strapi.server.use`
// in bootstrap sits BEFORE `router.routes()` in the Koa stack (Strapi mounts
// the router at listen(), after all plugin bootstraps), so it executes before
// route dispatch and sees neither the authenticated user nor the route —
// which silently disabled all enforcement on Strapi 5.

const interceptor = require('../services/request-interceptor');

// Core CRUD actions run through Strapi's core controllers, which pass
// ctx.query AND ctx.request.body through contentAPI.validate/sanitize.
// Scoping templates routinely reference private/restricted attributes
// (createdBy, user relations like `owners`) that validate would 400 on and
// sanitize would strip — so for these actions both the filter fragment and
// the body fragment stay out of the request and are applied post-sanitize at
// the documents-service layer instead (bootstrap.js
// installDocumentsPolicyEnforcer). Custom actions keep the ctx.query/body
// injection: their handlers read the request directly without the content-API
// validation pipeline.
const CORE_CRUD_ACTIONS = new Set(['find', 'findOne', 'create', 'update', 'delete']);

module.exports = (config, { strapi }) => {
  return async (ctx, next) => {
    const cfg = strapi.config.get('plugin::api-pro') || {};
    if (cfg.interceptorEnabled === false) return next();
    if (strapi.apiPro?.isBypassed?.(ctx.path)) return next();

    try {
      const actionName = String(ctx.state?.route?.handler || '').split('.').pop();
      const isCoreCrud = CORE_CRUD_ACTIONS.has(actionName);
      const result = await interceptor.process(ctx, strapi, {
        injectFilters: !isCoreCrud,
        injectBody: !isCoreCrud,
      });

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
      strapi.log.error(`[api-pro] enforce middleware error on ${ctx.method} ${ctx.path}: ${error?.stack || error?.message}`);
    }

    return next();
  };
};
