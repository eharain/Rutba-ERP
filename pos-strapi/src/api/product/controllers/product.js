'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

module.exports = createCoreController('api::product.product', ({ strapi }) => ({
  async publicDetail(ctx) {
    const documentId = ctx.params?.documentId;
    if (!documentId) return ctx.badRequest('documentId is required');

    const data = await strapi
      .service('api::product.product')
      .findPublicDetail(documentId);

    return ctx.send({ data: data ?? null });
  },

  async publicByIds(ctx) {
    const raw = ctx.query?.ids;
    const ids = Array.isArray(raw)
      ? raw
      : typeof raw === 'string' ? raw.split(',') : [];
    const data = await strapi
      .service('api::product.product')
      .findPublicByIds(ids);
    return ctx.send({ data });
  },

  async publicSearch(ctx) {
    const q = ctx.query?.q ?? '';
    const pageSize = clampInt(ctx.query?.pageSize, 5, 1, 50);
    const data = await strapi
      .service('api::product.product')
      .findPublicSearch(q, pageSize);
    return ctx.send({ data });
  },

  async publicHighestPrice(ctx) {
    const data = await strapi
      .service('api::product.product')
      .findPublicHighestPrice();
    return ctx.send({ data });
  },

  async publicList(ctx) {
    const q = ctx.query ?? {};
    const filter = {
      collection: q.collection || undefined,
      brand: q.brand || undefined,
      category: q.category || undefined,
      minPrice: q.minPrice ?? undefined,
      maxPrice: q.maxPrice ?? undefined,
      sort: q.sort || undefined,
    };
    const page = clampInt(q.page, 1, 1, 10_000);
    const pageSize = clampInt(q.pageSize, 24, 1, 100);

    const result = await strapi
      .service('api::product.product')
      .findPublicList({ filter, page, pageSize });

    return ctx.send(result);
  },

  async publish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::product.product').publish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async unpublish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::product.product').unpublish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async discardDraft(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::product.product').discardDraft({ documentId: ctx.params.id });
    return ctx.send(result);
  },
}));
