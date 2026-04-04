'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');

module.exports = createCoreController('api::brand.brand', ({ strapi }) => ({
  async publish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::brand.brand').publish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async unpublish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::brand.brand').unpublish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async discardDraft(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::brand.brand').discardDraft({ documentId: ctx.params.id });
    return ctx.send(result);
  },
}));
