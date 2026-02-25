'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');

module.exports = createCoreController('api::category-group.category-group', ({ strapi }) => ({
  async publish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::category-group.category-group').publish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async unpublish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::category-group.category-group').unpublish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
}));
