'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');

module.exports = createCoreController('api::cms-footer.cms-footer', ({ strapi }) => ({
  async publish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-footer.cms-footer').publish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async unpublish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::cms-footer.cms-footer').unpublish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
}));
