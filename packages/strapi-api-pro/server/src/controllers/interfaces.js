'use strict';

module.exports = {
  async list(ctx) {
    const data = await strapi.plugin('api-pro').service('interfaces').listInterfaces(strapi);
    ctx.body = { data };
  },

  async createFromRecordings(ctx) {
    try {
      const data = await strapi.plugin('api-pro').service('interfaces').createFromRecordings(strapi, ctx.request.body || {});
      ctx.body = { data };
    } catch (error) {
      ctx.badRequest(error.message);
    }
  },

  async createFromContentType(ctx) {
    try {
      const data = await strapi.plugin('api-pro').service('interfaces').createFromContentType(strapi, ctx.request.body || {});
      ctx.body = { data };
    } catch (error) {
      ctx.badRequest(error.message);
    }
  },

  async upsertMethod(ctx) {
    const interfaceId = Number(ctx.params.interfaceId);
    if (!interfaceId) {
      ctx.badRequest('interfaceId is required');
      return;
    }

    try {
      const data = await strapi.plugin('api-pro').service('interfaces').upsertMethod(strapi, interfaceId, ctx.request.body || {});
      ctx.body = {
        data,
        meta: {
          guidedFixApplied: Boolean(ctx.request.body?.guidedFix),
        },
      };
    } catch (error) {
      if (error.code === 'ROUTE_PARAM_MISMATCH') {
        ctx.status = 422;
        ctx.body = {
          error: {
            code: error.code,
            message: error.message,
            details: error.details || null,
          },
        };
        return;
      }
      ctx.badRequest(error.message);
    }
  },

  async validateAlignment(ctx) {
    const body = ctx.request.body || {};
    const path = body.path || '';
    const inputSignature = Array.isArray(body.inputSignature) ? body.inputSignature : [];
    const data = strapi.plugin('api-pro').service('interfaces').previewAlignment(path, inputSignature);
    ctx.body = { data };
  },

  async previewGuidedFix(ctx) {
    const body = ctx.request.body || {};
    const path = body.path || '';
    const inputSignature = Array.isArray(body.inputSignature) ? body.inputSignature : [];
    const preview = strapi.plugin('api-pro').service('interfaces').previewAlignment(path, inputSignature);
    ctx.body = {
      data: {
        ...preview,
        applyPayload: {
          guidedFix: true,
          inputSignature: preview.suggestedSignature,
        },
      },
    };
  },

  async lintScaffold(ctx) {
    const data = await strapi.plugin('api-pro').service('scaffoldRunner').lintMethodAlignment(strapi);
    ctx.body = { data };
  },

  async scaffold(ctx) {
    const { interfaceKey } = ctx.params;
    if (!interfaceKey) {
      ctx.status = 400;
      ctx.body = { error: { message: 'interfaceKey is required' } };
      return;
    }
    try {
      const data = await strapi.plugin('api-pro').service('scaffold').generate(strapi, interfaceKey);
      ctx.body = { data };
    } catch (error) {
      ctx.status = error?.status || 500;
      ctx.body = { error: { message: error?.message || 'Failed to scaffold interface' } };
    }
  },
};
