'use strict';

module.exports = {
  async list(ctx) {
    const users = await strapi.plugin('api-pro').service('users').listUsers(strapi);
    ctx.body = { data: users || [] };
  },

  async roleOptions(ctx) {
    const options = await strapi.plugin('api-pro').service('users').listAppRoleOptions(strapi);
    ctx.body = { data: options || [] };
  },

  async assignRoles(ctx) {
    const userId = Number(ctx.params.id);
    const body = ctx.request.body?.data || ctx.request.body || {};
    const roleIds = Array.isArray(body.roleIds) ? body.roleIds : [];

    try {
      const data = await strapi.plugin('api-pro').service('users').assignUserAppRoles(strapi, userId, roleIds);
      ctx.body = { data };
    } catch (error) {
      const status = error?.status || 400;
      ctx.status = status;
      ctx.body = {
        error: {
          message: error.message || 'Failed to assign app roles',
        },
      };
    }
  },
};
