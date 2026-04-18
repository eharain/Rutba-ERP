'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');

module.exports = createCoreController('api::product-group.product-group', ({ strapi }) => ({
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
    const page = parseInt(ctx.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(ctx.query.pageSize, 10) || 24, 100);
    const sort = ctx.query.sort || 'createdAt:desc';

    // Find the published product group by slug
    const groups = await strapi.documents('api::product-group.product-group').findMany({
      filters: { slug: { $eq: slug } },
      status: 'published',
      populate: ['cover_image', 'gallery', 'offers'],
    });

    if (!groups || groups.length === 0) {
      return ctx.notFound('Product group not found');
    }

    const group = groups[0];

    // Count total products in this group
    const knex = strapi.db.connection;
    const linkTable = 'product_groups_products_lnk';

    const [{ count: totalCount }] = await knex(linkTable)
      .where('product_group_id', group.id)
      .count('* as count');

    const total = parseInt(totalCount, 10);
    const pageCount = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    // Get paginated product IDs
    const links = await knex(linkTable)
      .where('product_group_id', group.id)
      .select('product_id')
      .offset(offset)
      .limit(pageSize);

    const productIds = links.map(l => l.product_id);

    let products = [];
    if (productIds.length > 0) {
      // Fetch full product data with populates
      products = await strapi.documents('api::product.product').findMany({
        filters: { id: { $in: productIds } },
        status: 'published',
        populate: {
          gallery: true,
          logo: true,
          brands: true,
          categories: true,
          variants: { populate: { terms: { populate: { term_types: true } } } },
        },
      });
    }

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
