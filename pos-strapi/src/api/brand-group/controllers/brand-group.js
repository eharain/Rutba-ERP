'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');

module.exports = createCoreController('api::brand-group.brand-group', ({ strapi }) => ({
  async publish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::brand-group.brand-group').publish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async unpublish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::brand-group.brand-group').unpublish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
}));
