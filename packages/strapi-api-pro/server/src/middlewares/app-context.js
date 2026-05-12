'use strict';

// Per-route middleware that resolves the api-pro claim and attaches it to
// ctx.state.apiProClaim. Routes opt in via `middlewares: ['plugin::api-pro.appContext']`.
//
// This middleware is INDEPENDENT of the global request-interceptor installed
// in bootstrap.js — the interceptor handles policy enforcement against the
// content-API surface, while this middleware exists so plugin-internal admin
// routes can require an app context cheaply without running the full interceptor.

module.exports = (config, { strapi }) => {
  const required = config?.required !== false;
  const requireApp = config?.requireApp !== false;
  const requireActiveRole = config?.requireActiveRole !== false;

  return async (ctx, next) => {
    if (!required) {
      return next();
    }

    // Bypass paths registered globally — skip the claim too. This lets things
    // like /api/api-pro/me/permissions short-circuit through middleware chains.
    if (strapi.apiPro?.isBypassed?.(ctx.path)) {
      return next();
    }

    try {
      const claim = await strapi
        .plugin('api-pro')
        .service('context')
        .resolveClaim(ctx, strapi, { requireApp, requireActiveRole });

      ctx.state.apiProClaim = claim;
    } catch (error) {
      ctx.status = error?.status || 403;
      ctx.body = {
        error: {
          code: error?.code || 'CONTEXT_VALIDATION_FAILED',
          message: error?.message || 'Context validation failed',
        },
      };
      return;
    }

    await next();
  };
};
