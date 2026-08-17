'use strict';

/**
 * Content-sync trigger routes.
 *
 * No content type behind this API — it only brokers calls into the
 * strapi-content-sync-pro plugin, whose own controls sit on admin routes that
 * an app JWT cannot reach.
 *
 * Literal sub-paths are declared before the parameterised one so koa-router
 * (first match wins) does not shadow them.
 */
module.exports = {
  routes: [
    { method: 'GET',  path: '/content-sync/config',           handler: 'content-sync.config' },
    { method: 'GET',  path: '/content-sync/status',           handler: 'content-sync.status' },
    { method: 'GET',  path: '/content-sync/status/:jobId',    handler: 'content-sync.status' },
    { method: 'POST', path: '/content-sync/run',              handler: 'content-sync.run' },
    { method: 'POST', path: '/content-sync/cancel/:jobId',    handler: 'content-sync.cancel' },
  ],
};
