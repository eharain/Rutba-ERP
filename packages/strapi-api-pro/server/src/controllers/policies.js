'use strict';

// Admin CRUD over api-pro method policies. All mutations go through the
// policies service which keeps .api-pro/policies/ files and the DB mirror
// in step.
//
// Identity is (interfaceKey, methodKey, roleKey). The composite key
// `${interfaceKey}:${methodKey}:${roleKey}` is the DB primary identifier;
// the file path is .api-pro/policies/{interfaceKey}/{methodKey}/{roleKey}.json

function sendError(ctx, status, message, code) {
  ctx.status = status;
  ctx.body = { error: { code: code || 'API_PRO_ERROR', message } };
}

module.exports = {
  async list(ctx) {
    const { interfaceKey, methodKey, roleKey } = ctx.query || {};
    const data = await strapi
      .plugin('api-pro')
      .service('policies')
      .list(strapi, { interfaceKey, methodKey, roleKey });
    ctx.body = { data };
  },

  async findOne(ctx) {
    const { interfaceKey, methodKey, roleKey } = ctx.params;
    const data = await strapi
      .plugin('api-pro')
      .service('policies')
      .findOne(strapi, { interfaceKey, methodKey, roleKey });
    if (!data) return sendError(ctx, 404, 'policy not found', 'NOT_FOUND');
    ctx.body = { data };
  },

  async upsert(ctx) {
    const { interfaceKey, methodKey, roleKey } = ctx.params;
    const body = ctx.request.body?.data || ctx.request.body || {};
    try {
      const data = await strapi
        .plugin('api-pro')
        .service('policies')
        .upsert(strapi, { interfaceKey, methodKey, roleKey, data: body });
      ctx.body = { data };
    } catch (error) {
      sendError(ctx, error?.status || 400, error?.message || 'Failed to save policy');
    }
  },

  async remove(ctx) {
    const { interfaceKey, methodKey, roleKey } = ctx.params;
    try {
      const data = await strapi
        .plugin('api-pro')
        .service('policies')
        .remove(strapi, { interfaceKey, methodKey, roleKey });
      ctx.body = { data };
    } catch (error) {
      sendError(ctx, error?.status || 400, error?.message || 'Failed to delete policy');
    }
  },

  // ── Method-level bulk endpoints (Comparative Editor) ─────────────────────
  async findForMethod(ctx) {
    const { interfaceKey, methodKey } = ctx.params;
    try {
      const data = await strapi
        .plugin('api-pro')
        .service('policies')
        .findForMethod(strapi, { interfaceKey, methodKey });
      ctx.body = { data };
    } catch (error) {
      sendError(ctx, error?.status || 500, error?.message || 'Failed to load method policies');
    }
  },

  async bulkUpsertForMethod(ctx) {
    const { interfaceKey, methodKey } = ctx.params;
    const body = ctx.request.body?.data || ctx.request.body || {};
    const policies = body.policies || {};
    try {
      const data = await strapi
        .plugin('api-pro')
        .service('policies')
        .bulkUpsertForMethod(strapi, { interfaceKey, methodKey, policies });
      ctx.body = { data };
    } catch (error) {
      sendError(ctx, error?.status || 400, error?.message || 'Failed to save method policies');
    }
  },
};
