'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');
const { requireApp } = require('../../../utils/require-app');

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

module.exports = createCoreController('api::product.product', ({ strapi }) => ({
  async publicDetail(ctx) {
    if (!requireApp(ctx, 'web')) return;
    // The route param is named `documentId` for backward compat; in practice
    // it carries a product slug (the canonical identifier) and the service
    // transparently falls back to documentId lookup for legacy URLs.
    const slugOrDocumentId = ctx.params?.documentId;
    if (!slugOrDocumentId) return ctx.badRequest('slug is required');

    const data = await strapi
      .service('api::product.product')
      .findPublicDetail(slugOrDocumentId);

    // Group context is optional. When present, ask the offer service for the
    // effective price/free-shipping for this (product, group) pair. The
    // storefront uses this to render the right price without re-deriving the
    // rules client-side.
    let offerContext = null;
    const groupId = typeof ctx.query?.groupId === 'string' ? ctx.query.groupId.trim() : '';
    if (data?.id && groupId) {
      offerContext = await strapi
        .service('api::sale-offer.sale-offer')
        .resolveOfferForProductInGroup(data.id, groupId);
    }

    return ctx.send({ data: data ?? null, meta: { offerContext } });
  },

  async publicByIds(ctx) {
    if (!requireApp(ctx, 'web')) return;
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
    if (!requireApp(ctx, 'web')) return;
    const q = ctx.query?.q ?? '';
    const pageSize = clampInt(ctx.query?.pageSize, 5, 1, 50);
    const data = await strapi
      .service('api::product.product')
      .findPublicSearch(q, pageSize);
    return ctx.send({ data });
  },

  async publicHighestPrice(ctx) {
    if (!requireApp(ctx, 'web')) return;
    const data = await strapi
      .service('api::product.product')
      .findPublicHighestPrice();
    return ctx.send({ data });
  },

  async publicList(ctx) {
    if (!requireApp(ctx, 'web')) return;
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
