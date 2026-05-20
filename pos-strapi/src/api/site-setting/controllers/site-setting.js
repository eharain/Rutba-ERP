'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::site-setting.site-setting', ({ strapi }) => ({
  async find(ctx) {
    const uid = 'api::site-setting.site-setting';
    const { populate, fields } = ctx.query || {};
    const opts = {
      ...(populate ? { populate } : {}),
      ...(fields ? { fields } : {}),
    };

    // Prefer the published row (what the storefront should normally show);
    // fall back to the draft so a freshly-edited record never hard-404s the
    // public client. The storefront uses its own defaults if data is null.
    let doc = await strapi.documents(uid).findFirst({ status: 'published', ...opts });
    if (!doc) {
      doc = await strapi.documents(uid).findFirst({ status: 'draft', ...opts });
    }

    return ctx.send({ data: doc ?? null });
  },
  async publish(ctx) {
    // Find the single-type document first
    const doc = await strapi.documents('api::site-setting.site-setting').findFirst({ status: 'draft' });
    if (!doc) return ctx.notFound('Site setting not found');
    const result = await strapi.documents('api::site-setting.site-setting').publish({ documentId: doc.documentId });
    ctx.body = { data: result };
  },
  async unpublish(ctx) {
    const doc = await strapi.documents('api::site-setting.site-setting').findFirst({ status: 'published' });
    if (!doc) return ctx.notFound('Site setting not found');
    const result = await strapi.documents('api::site-setting.site-setting').unpublish({ documentId: doc.documentId });
    ctx.body = { data: result };
  },
  async discardDraft(ctx) {
    const doc = await strapi.documents('api::site-setting.site-setting').findFirst({ status: 'draft' });
    if (!doc) return ctx.notFound('Site setting not found');
    const result = await strapi.documents('api::site-setting.site-setting').discardDraft({ documentId: doc.documentId });
    ctx.body = { data: result };
  },
}));
