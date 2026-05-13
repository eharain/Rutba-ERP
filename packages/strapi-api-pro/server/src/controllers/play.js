'use strict';

// Admin controller for the "Play as role" feature. Routes through the
// admin surface so Strapi's admin auth gates it.

module.exports = {
  async run(ctx) {
    const body = ctx.request.body?.data || ctx.request.body || {};
    try {
      const result = await strapi.plugin('api-pro').service('play').play(strapi, body);
      ctx.body = { data: result };
    } catch (error) {
      ctx.status = error?.status || 500;
      ctx.body = { error: { message: error?.message || 'Play failed' } };
    }
  },
};
