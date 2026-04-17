'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::site-setting.site-setting', ({ strapi }) => ({
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
