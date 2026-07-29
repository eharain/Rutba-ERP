'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

const UID = 'api::site-setting.site-setting';

/**
 * The app whose settings a request wants.
 *
 * Explicit `?app=` wins; otherwise fall back to the app header every Rutba
 * client already sends (X-Rutba-App), so the storefront keeps resolving to its
 * own row without any client change. Nothing matching → the resolver's
 * is_default row.
 */
function appSlugFrom(ctx) {
  const q = ctx.query || {};
  return (
    q.app
    || q.app_slug
    || ctx.request?.header?.['x-rutba-app']
    || null
  );
}

/**
 * Keep only the read params the document service accepts — `app` is ours and
 * would be rejected as an unknown key if it were passed through.
 */
function readOpts(ctx) {
  const { populate, fields, status } = ctx.query || {};
  return {
    ...(populate ? { populate } : {}),
    ...(fields ? { fields } : {}),
    ...(status ? { status } : {}),
  };
}

module.exports = createCoreController(UID, ({ strapi }) => ({
  /**
   * GET /site-setting            → the requesting app's row, else the default
   * GET /site-setting?app=pos    → the pos row, else the default
   *
   * This path was the singleType read before site settings became a
   * collection. Keeping it as the RESOLVER is what lets every existing
   * consumer — storefront, CMS, social — carry on unchanged.
   */
  async find(ctx) {
    const doc = await strapi
      .service(UID)
      .resolve(appSlugFrom(ctx), readOpts(ctx));

    return ctx.send({ data: doc ?? null });
  },

  async publish(ctx) {
    const doc = await strapi.service(UID).resolve(appSlugFrom(ctx), { status: 'draft' });
    if (!doc) return ctx.notFound('Site setting not found');
    const result = await strapi.documents(UID).publish({ documentId: doc.documentId });
    ctx.body = { data: result };
  },

  async unpublish(ctx) {
    const doc = await strapi.service(UID).resolve(appSlugFrom(ctx), { status: 'published' });
    if (!doc) return ctx.notFound('Site setting not found');
    const result = await strapi.documents(UID).unpublish({ documentId: doc.documentId });
    ctx.body = { data: result };
  },

  async discardDraft(ctx) {
    const doc = await strapi.service(UID).resolve(appSlugFrom(ctx), { status: 'draft' });
    if (!doc) return ctx.notFound('Site setting not found');
    const result = await strapi.documents(UID).discardDraft({ documentId: doc.documentId });
    ctx.body = { data: result };
  },
}));
