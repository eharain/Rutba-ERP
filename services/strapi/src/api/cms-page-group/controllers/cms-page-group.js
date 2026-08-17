'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');

module.exports = createCoreController('api::cms-page-group.cms-page-group', ({ strapi }) => ({
  async publicBySlug(ctx) {
    const slug = ctx.params?.slug;
    if (!slug) return ctx.badRequest('slug is required');

    const group = await strapi
      .service('api::cms-page-group.cms-page-group')
      .findPublicBySlug(slug);

    return ctx.send({ data: group });
  },
  async publish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-page-group.cms-page-group').publish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async unpublish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-page-group.cms-page-group').unpublish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async discardDraft(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-page-group.cms-page-group').discardDraft({ documentId: ctx.params.id });
    return ctx.send(result);
  },
}));
