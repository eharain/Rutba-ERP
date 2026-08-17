'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');

module.exports = createCoreController('api::cms-menu.cms-menu', ({ strapi }) => ({
  async publicTree(ctx) {
    const menus = await strapi.service('api::cms-menu.cms-menu').findPublicTree();
    return ctx.send({ data: menus });
  },
  async publish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-menu.cms-menu').publish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async unpublish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-menu.cms-menu').unpublish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async discardDraft(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-menu.cms-menu').discardDraft({ documentId: ctx.params.id });
    return ctx.send(result);
  },
}));
