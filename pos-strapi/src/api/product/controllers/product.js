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
  // Default list. Extended only to resolve the CMS "Unpublished" filter, which
  // is a set-difference (documents that have a draft but no published sibling)
  // and therefore not expressible as a single field filter. Every other caller
  // — and the "Published" filter (served by status=published) — is untouched.
  async find(ctx) {
    // Stock-item barcode/SKU search. The client can't filter products by the
    // `items` relation (stock-item is outside most roles' domains — CMS has no
    // access — so Strapi rejects it as an invalid filter key), so it passes the
    // term as a `stockSearch` hint and we resolve it here with full privileges:
    // find stock-items whose barcode or SKU matches, collect their owning
    // products, and OR those ids into the incoming filters. Runs first so the
    // publishState / low-stock constraints below still AND on top.
    if (ctx.query?.stockSearch) {
      const term = String(ctx.query.stockSearch).trim();
      delete ctx.query.stockSearch;
      if (term) {
        const stockItems = await strapi.db.query('api::stock-item.stock-item').findMany({
          where: { $or: [{ barcode: term }, { sku: term }] },
          select: ['id'],
          // documentId (not numeric id): products use draft & publish, so a
          // stock-item links to both version rows and the numeric id we'd
          // collect may differ from the one super.find() returns for the
          // requested status. documentId is stable across versions.
          populate: { product: { select: ['id', 'documentId'] } },
          limit: 500,
        });
        const productDocIds = [...new Set(stockItems.map((si) => si.product?.documentId).filter(Boolean))];
        if (productDocIds.length > 0) {
          const idFilter = { documentId: { $in: productDocIds } };
          // OR the stock-item hits with whatever product-level search the
          // client already built (name/sku/barcode/supplier/PO).
          ctx.query.filters = ctx.query.filters
            ? { $or: [ctx.query.filters, idFilter] }
            : idFilter;
        }
        // No stock-item matched → leave filters untouched; the product-level
        // $or search still applies.
      }
    }

    if (ctx.query?.publishState === 'unpublished') {
      // Strip our custom hint so the core query builder doesn't see it.
      delete ctx.query.publishState;
      ctx.query.status = 'draft';

      // documentIds that have a published row (published_at IS NOT NULL).
      // NOTE: the db query engine has no `limit: -1` convention (that's
      // entityService/REST); omitting limit returns all matching rows.
      const publishedRows = await strapi.db.query('api::product.product').findMany({
        where: { publishedAt: { $notNull: true } },
        select: ['documentId'],
      });
      const publishedDocIds = [...new Set(publishedRows.map((r) => r.documentId).filter(Boolean))];

      // Exclude the published documents; if nothing is published every draft is
      // already unpublished, so no extra filter is needed. Wrap any existing
      // filters (built-ins, api-guard ownership, etc.) in $and to preserve them.
      if (publishedDocIds.length > 0) {
        const exclude = { documentId: { $notIn: publishedDocIds } };
        ctx.query.filters = ctx.query.filters
          ? { $and: [ctx.query.filters, exclude] }
          : exclude;
      }
    }

    // "Low stock" filter. Low = positive stock at or below the product's own
    // reorder_level — a column-to-column comparison the REST filter syntax can't
    // express, so the client sends a `stockStatus=low` hint and we resolve it to
    // a documentId set here. (outOfStock / inStock are plain field filters and
    // never reach this branch.) Products without a reorder_level are excluded.
    if (ctx.query?.stockStatus === 'low') {
      delete ctx.query.stockStatus;
      const lowRows = await strapi.db.connection('products')
        .whereNotNull('reorder_level')
        .andWhere('stock_quantity', '>', 0)
        .andWhereRaw('stock_quantity <= reorder_level')
        .select('document_id');
      const lowDocIds = [...new Set(lowRows.map((r) => r.document_id).filter(Boolean))];
      // No product qualifies → an unsatisfiable filter yields an empty page
      // rather than silently returning everything.
      const lowFilter = lowDocIds.length > 0
        ? { documentId: { $in: lowDocIds } }
        : { documentId: { $in: ['__none__'] } };
      ctx.query.filters = ctx.query.filters
        ? { $and: [ctx.query.filters, lowFilter] }
        : lowFilter;
    }
    return await super.find(ctx);
  },

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
