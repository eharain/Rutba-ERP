'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

// Drafts of nested relations can leak through Strapi 5 populate trees even
// when the parent is fetched as published, so guard every relation that the
// storefront renders as a public surface.
const PUBLISHED_FILTER = { filters: { publishedAt: { $notNull: true } } };

const DETAIL_FIELDS = [
  'title', 'slug', 'excerpt', 'content', 'page_type', 'sort_order',
  'enable_contact_form', 'createdAt', 'updatedAt', 'publishedAt',
  'excerpt_priority', 'featured_image_priority', 'content_priority',
  'gallery_priority', 'related_pages_priority', 'page_groups_priority',
  'featured_image_show_overlay',
];

const DETAIL_POPULATE = {
  featured_image: true,
  background_image: true,
  gallery: true,
  hero_product_groups: {
    ...PUBLISHED_FILTER,
    populate: {
      cover_image: true,
      offers: true,
      products: {
        ...PUBLISHED_FILTER,
        populate: {
          gallery: true,
          logo: true,
          brands: true,
          categories: true,
          variants: { populate: { terms: { populate: { term_types: true } } } },
        },
      },
    },
  },
  brand_groups: {
    populate: { brands: { populate: { logo: true } } },
  },
  category_groups: {
    populate: { categories: { populate: { logo: true } } },
  },
  product_groups: {
    ...PUBLISHED_FILTER,
    populate: {
      cover_image: true,
      offers: true,
      products: {
        ...PUBLISHED_FILTER,
        populate: {
          gallery: true,
          logo: true,
          brands: true,
          categories: true,
          variants: { populate: { terms: { populate: { term_types: true } } } },
        },
      },
    },
  },
  related_pages: {
    // Explicit fields: storefront builds /:page_type/:slug links and renders
    // title/excerpt on the card; some populate shapes drop scalars otherwise.
    fields: ['title', 'slug', 'excerpt', 'page_type'],
    ...PUBLISHED_FILTER,
    populate: { featured_image: true },
  },
  page_groups: {
    ...PUBLISHED_FILTER,
    populate: {
      cover_image: true,
      pages: {
        ...PUBLISHED_FILTER,
        fields: ['title', 'slug', 'excerpt', 'page_type'],
        populate: { featured_image: true },
      },
    },
  },
  footer: { populate: { pinned_pages: true } },
  // Menus assigned to this page — the storefront uses these by position,
  // overriding the site-wide default. Light shape; the full resolved tree
  // comes from /cms-menus/public, keyed by slug.
  menus: { fields: ['slug', 'position'] },
};

module.exports = createCoreService('api::cms-page.cms-page', ({ strapi }) => ({
  async findPublicBySlug(slug, { draft = false } = {}) {
    if (!slug) return null;
    const results = await strapi.documents('api::cms-page.cms-page').findMany({
      filters: { slug: { $eq: slug } },
      status: draft ? 'draft' : 'published',
      populate: DETAIL_POPULATE,
      fields: DETAIL_FIELDS,
      pagination: { pageSize: 1 },
    });
    return results?.[0] ?? null;
  },
}));
