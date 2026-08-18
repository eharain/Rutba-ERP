'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');
const { isApp } = require('../../../utils/require-app');
const { ACTIVE_PRODUCT_FILTER } = require('../../../utils/active-product');
const { NOT_A_VARIANT, imagedProductIdSet } = require('../../../utils/public-product');

// findBySlug is public (auth: false), so its `sort` reaches the query builder
// straight from the querystring — an unrecognised field would blow up the
// request. Only these are orderable; anything else falls back to the documented
// default rather than erroring.
const SORTABLE_FIELDS = new Set(['createdAt', 'updatedAt', 'name', 'selling_price']);
const DEFAULT_SORT = 'createdAt:desc';

function parseSort(raw) {
  const [field, direction] = String(raw ?? '').split(':');
  if (!SORTABLE_FIELDS.has(field)) return DEFAULT_SORT;
  return `${field}:${/^asc$/i.test(direction) ? 'asc' : 'desc'}`;
}

module.exports = createCoreController('api::product-group.product-group', ({ strapi }) => ({
  // The storefront's featured strip and home banner both read /product-groups
  // with the group's products populated inline. Deactivated products must not
  // ride along. The filter can't be pushed into the query — callers send
  // different populate shapes (object tree vs dotted array) and rewriting an
  // arbitrary shape is fragile — so the rows are dropped on the way out.
  //
  // Which rows to drop is resolved against the DB rather than read off the
  // response: a caller that restricts the populate's `fields` would omit
  // is_active, and a payload-driven check would then silently pass every
  // deactivated product through. Storefront only — the CMS group editor still
  // needs to see every linked product in order to manage it.
  async find(ctx) {
    const response = await super.find(ctx);
    if (!isApp(ctx, 'storefront') || !Array.isArray(response?.data)) return response;

    const groups = response.data.filter((g) => Array.isArray(g?.products) && g.products.length > 0);
    const documentIds = [...new Set(groups.flatMap((g) => g.products.map((p) => p?.documentId).filter(Boolean)))];
    if (documentIds.length === 0) return response;

    const inactiveRows = await strapi.db.query('api::product.product').findMany({
      where: { documentId: { $in: documentIds }, is_active: false, publishedAt: { $notNull: true } },
      select: ['documentId'],
    });
    if (inactiveRows.length === 0) return response;

    const inactive = new Set(inactiveRows.map((r) => r.documentId));
    for (const group of groups) {
      group.products = group.products.filter((p) => !inactive.has(p?.documentId));
    }
    return response;
  },

  async publish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::product-group.product-group').publish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async unpublish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::product-group.product-group').unpublish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async discardDraft(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents('api::product-group.product-group').discardDraft({ documentId: ctx.params.id });
    return ctx.send(result);
  },

  /**
   * GET /product-groups/by-slug/:slug
   * Returns the product group with paginated products.
   * Query params: page (default 1), pageSize (default 24), sort (default "createdAt:desc")
   */
  async findBySlug(ctx) {
    const { slug } = ctx.params;
    // Clamped, not just parsed: these now feed the query builder directly, and
    // a negative page or pageSize off the public querystring would fail the request.
    const page = Math.max(1, parseInt(ctx.query.page, 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(ctx.query.pageSize, 10) || 24), 100);
    const sort = parseSort(ctx.query.sort);

    // Find the published product group by slug.
    const populate = {
      cover_image: true,
      gallery: true,
      offers: true,
      seo_meta: { populate: { og_image: true } },
    };
    const groups = await strapi.documents('api::product-group.product-group').findMany({
      filters: { slug: { $eq: slug } },
      status: 'published',
      populate,
    });

    // Slug is the canonical key, but storefront callers forward
    // `group.slug || group.documentId` (see apps/content/storefront product-href), so the
    // param can legitimately carry a documentId for a group that has no slug.
    // Falling back keeps this endpoint accepting the same key space that
    // findPublicDetail and resolveOfferForProductInGroup already accept —
    // otherwise a documentId-keyed caller gets a 404 for a group that exists.
    let group = groups && groups.length > 0 ? groups[0] : null;
    if (!group) {
      group = await strapi.documents('api::product-group.product-group').findOne({
        documentId: slug,
        status: 'published',
        populate,
      });
    }

    if (!group) {
      return ctx.notFound('Product group not found');
    }

    // Every product linked to this group. Pagination is applied to the product
    // query rather than to these link rows: the link table knows nothing about
    // publish state or is_active, so paging it would hand back short pages and
    // a total that overcounts what the storefront actually renders.
    const knex = strapi.db.connection;
    const links = await knex('product_groups_products_lnk')
      .where('product_group_id', group.id)
      .select('product_id');
    const productIds = links.map(l => l.product_id);

    let products = [];
    let total = 0;
    // Same listable gate as the shop grid: image-less products and stray
    // variants are hidden here too, and the pagination totals stay exact
    // because the gate is resolved to an id set before the query runs.
    const sellableIds =
      productIds.length > 0 ? Array.from(await imagedProductIdSet(strapi, productIds)) : [];
    if (sellableIds.length > 0) {
      const filters = { $and: [{ id: { $in: sellableIds } }, ACTIVE_PRODUCT_FILTER, NOT_A_VARIANT] };
      [products, total] = await Promise.all([
        strapi.documents('api::product.product').findMany({
          filters,
          status: 'published',
          populate: {
            gallery: true,
            logo: true,
            brands: true,
            categories: true,
            variants: { populate: { terms: { populate: { term_types: true } } } },
          },
          sort: [sort],
          // start/limit, not `pagination:{...}` — the document service drops the
          // nested form, so this query was returning every product in the group
          // on every page while meta.pagination advertised a page size that was
          // never applied. See findPublicList in the product service.
          start: (page - 1) * pageSize,
          limit: pageSize,
        }),
        strapi.documents('api::product.product').count({ filters, status: 'published' }),
      ]);
    }

    const pageCount = Math.max(1, Math.ceil(total / pageSize));

    return ctx.send({
      data: {
        ...group,
        products,
      },
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount,
          total,
        },
      },
    });
  },
}));
