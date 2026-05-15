'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');

module.exports = createCoreController('api::cms-page.cms-page', ({ strapi }) => ({
  async publicBySlug(ctx) {
    const slug = ctx.params?.slug;
    if (!slug) return ctx.badRequest('slug is required');

    const draftRaw = ctx.query?.draft;
    const wantDraft = draftRaw === 'true' || draftRaw === true || draftRaw === '1';

    // Draft preview is editor-only; published reads stay anonymous so the
    // storefront's unauth client keeps working.
    if (wantDraft) {
      if (!await ensureUser(ctx, strapi)) return;
    }

    const page = await strapi
      .service('api::cms-page.cms-page')
      .findPublicBySlug(slug, { draft: wantDraft });

    return ctx.send({ data: page });
  },
  async publish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-page.cms-page').publish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async unpublish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-page.cms-page').unpublish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async discardDraft(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-page.cms-page').discardDraft({ documentId: ctx.params.id });
    return ctx.send(result);
  },
}));
