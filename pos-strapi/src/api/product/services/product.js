'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

// Drafts of nested relations can slip through Strapi 5 populate trees even
// when the parent is fetched as published.
const PUBLISHED_FILTER = { filters: { publishedAt: { $notNull: true } } };

const DETAIL_FIELDS = [
  'name', 'sku', 'barcode', 'selling_price', 'cost_price', 'offer_price',
  'stock_quantity', 'summary', 'description', 'is_variant', 'is_active', 'keywords',
];

const VARIANT_FIELDS = [
  'name', 'sku', 'barcode', 'selling_price', 'cost_price', 'offer_price',
  'stock_quantity', 'summary', 'description', 'is_variant',
];

const PUBLIC_POPULATE = {
  gallery: true,
  logo: true,
  brands: true,
  categories: true,
  terms: { populate: { term_types: true } },
  variants: {
    ...PUBLISHED_FILTER,
    fields: VARIANT_FIELDS,
    populate: {
      gallery: true,
      logo: true,
      terms: { populate: { term_types: true } },
    },
  },
};

function buildListFilters(filter = {}) {
  const and = [];
  if (filter.collection) and.push({ collections: { slug: { $eq: filter.collection } } });
  if (filter.brand) and.push({ brands: { slug: { $eq: filter.brand } } });
  if (filter.category) and.push({ categories: { slug: { $eq: filter.category } } });
  if (filter.minPrice != null && filter.minPrice !== '') {
    and.push({ selling_price: { $gte: Number(filter.minPrice) } });
  }
  if (filter.maxPrice != null && filter.maxPrice !== '') {
    and.push({ selling_price: { $lte: Number(filter.maxPrice) } });
  }
  return and.length > 0 ? { $and: and } : {};
}

function buildListSort(filter = {}) {
  if (filter.sort === 'price-low-high') return ['selling_price:ASC', 'name:ASC'];
  if (filter.sort === 'price-high-low') return ['selling_price:DESC', 'name:ASC'];
  return ['createdAt:DESC'];
}

module.exports = createCoreService('api::product.product', ({ strapi }) => ({
  async findPublicDetail(documentId) {
    if (!documentId) return null;
    return strapi.documents('api::product.product').findOne({
      documentId,
      status: 'published',
      fields: DETAIL_FIELDS,
      populate: PUBLIC_POPULATE,
    });
  },

  async findPublicByIds(ids = []) {
    const cleanIds = ids
      .map((v) => Number.parseInt(v, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (cleanIds.length === 0) return [];
    return strapi.documents('api::product.product').findMany({
      status: 'published',
      filters: { id: { $in: cleanIds } },
      fields: DETAIL_FIELDS,
      populate: PUBLIC_POPULATE,
      pagination: { pageSize: Math.max(cleanIds.length, 1) },
    });
  },

  async findPublicSearch(query, pageSize = 5) {
    const q = (query ?? '').trim();
    if (q.length === 0) return [];
    return strapi.documents('api::product.product').findMany({
      status: 'published',
      filters: { name: { $containsi: q } },
      fields: DETAIL_FIELDS,
      populate: PUBLIC_POPULATE,
      pagination: { pageSize },
    });
  },

  async findPublicHighestPrice() {
    const results = await strapi.documents('api::product.product').findMany({
      status: 'published',
      sort: ['selling_price:DESC', 'id:ASC'],
      fields: DETAIL_FIELDS,
      populate: PUBLIC_POPULATE,
      pagination: { pageSize: 1 },
    });
    return results?.[0] ?? null;
  },

  async findPublicList({ filter = {}, page = 1, pageSize = 24 } = {}) {
    const filters = buildListFilters(filter);
    const sort = buildListSort(filter);

    const [data, total] = await Promise.all([
      strapi.documents('api::product.product').findMany({
        status: 'published',
        filters,
        sort,
        populate: PUBLIC_POPULATE,
        pagination: { page, pageSize },
      }),
      strapi.documents('api::product.product').count({
        status: 'published',
        filters,
      }),
    ]);

    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    return { data, meta: { pagination: { page, pageSize, pageCount, total } } };
  },
}));
