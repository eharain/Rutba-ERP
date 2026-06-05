'use strict';

/**
 * cms-page-group service
 */

const { createCoreService } = require('@strapi/strapi').factories;

// Drafts of nested relations can leak through Strapi 5 populate trees even when
// the parent is fetched as published, so guard the member pages we render.
const PUBLISHED_FILTER = { filters: { publishedAt: { $notNull: true } } };

const DETAIL_FIELDS = ['name', 'slug', 'title', 'excerpt', 'layout', 'columns', 'sort_order'];

const DETAIL_POPULATE = {
  cover_image: true,
  pages: {
    ...PUBLISHED_FILTER,
    fields: ['title', 'slug', 'excerpt', 'page_type'],
    populate: { featured_image: true },
  },
};

module.exports = createCoreService('api::cms-page-group.cms-page-group', ({ strapi }) => ({
  async findPublicBySlug(slug) {
    if (!slug) return null;
    const results = await strapi.documents('api::cms-page-group.cms-page-group').findMany({
      filters: { slug: { $eq: slug } },
      status: 'published',
      populate: DETAIL_POPULATE,
      fields: DETAIL_FIELDS,
      pagination: { pageSize: 1 },
    });
    return results?.[0] ?? null;
  },
}));
