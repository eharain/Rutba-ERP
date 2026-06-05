'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');

module.exports = createCoreController('api::cms-menu-item.cms-menu-item', ({ strapi }) => ({
  async publish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-menu-item.cms-menu-item').publish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async unpublish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-menu-item.cms-menu-item').unpublish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async discardDraft(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-menu-item.cms-menu-item').discardDraft({ documentId: ctx.params.id });
    return ctx.send(result);
  },
}));
