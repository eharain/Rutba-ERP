'use strict';

/**
 * Resolver route for the return policy.
 *
 * The policy used to be a singleType, so `/return-policy` was its read path and
 * the storefront descriptor (packages/api-provider/api/web/return-policies.js)
 * still points there. Now that it is a collection, the core router serves
 * `/return-policies`; this file keeps the singular path alive as the resolver
 * (app_slug → is_default → any row) so no consumer had to change.
 *
 * Registered in the alphabetically-first route file so koa-router matches this
 * handler before the core router's generated routes.
 */
module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/return-policy',
      handler: 'return-policy.findEffective',
    },
  ],
};
