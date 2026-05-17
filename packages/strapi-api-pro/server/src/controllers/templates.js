'use strict';

module.exports = {
  async list(ctx) {
    const data = await strapi.plugin('api-pro').service('templates').listTemplates(strapi);
    ctx.body = { data: data || [] };
  },

  async create(ctx) {
    const body = ctx.request.body?.data || ctx.request.body || {};
    try {
      const data = await strapi.plugin('api-pro').service('templates').createTemplate(strapi, body);
      ctx.body = { data };
    } catch (error) {
      ctx.status = error?.status || 400;
      ctx.body = { error: { message: error.message || 'Failed to create template' } };
    }
  },

  async update(ctx) {
    const body = ctx.request.body?.data || ctx.request.body || {};
    try {
      const data = await strapi.plugin('api-pro').service('templates').updateTemplate(strapi, ctx.params.id, body);
      ctx.body = { data };
    } catch (error) {
      ctx.status = error?.status || 400;
      ctx.body = { error: { message: error.message || 'Failed to update template' } };
    }
  },

  async remove(ctx) {
    try {
      const data = await strapi.plugin('api-pro').service('templates').deleteTemplate(strapi, ctx.params.id);
      ctx.body = { data };
    } catch (error) {
      ctx.status = error?.status || 400;
      ctx.body = { error: { message: error.message || 'Failed to delete template' } };
    }
  },
};
