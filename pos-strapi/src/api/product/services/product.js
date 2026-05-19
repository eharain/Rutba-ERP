'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

// Drafts of nested relations can slip through Strapi 5 populate trees even
// when the parent is fetched as published.
const PUBLISHED_FILTER = { filters: { publishedAt: { $notNull: true } } };

const DETAIL_FIELDS = [
  'name', 'slug', 'sku', 'barcode', 'selling_price', 'cost_price', 'offer_price',
  'stock_quantity', 'summary', 'description', 'is_variant', 'is_active', 'keywords',
];

const VARIANT_FIELDS = [
  'name', 'slug', 'sku', 'barcode', 'selling_price', 'cost_price', 'offer_price',
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
  // The storefront only sees products that are pinned by at least one
  // *published* product-group. This is the editorial gate that decides what
  // goes on the web — keeping it out of buildListFilters and in its own helper
  // because the relation is uni-directional (product has no inverse
  // product_groups field), so it can't ride along as a normal Strapi filter.
  async _pinnedProductIds() {
    const groups = await strapi.documents('api::product-group.product-group').findMany({
      status: 'published',
      fields: ['id'],
      populate: { products: { fields: ['id'] } },
      pagination: { pageSize: 1000 },
    });
    const ids = new Set();
    for (const g of groups ?? []) {
      for (const p of g.products ?? []) {
        if (p?.id) ids.add(p.id);
      }
    }
    return Array.from(ids);
  },

  // Accepts either a slug or a documentId. We try slug first because that is
  // the canonical lookup going forward; falling back to documentId keeps any
  // pre-slug URLs (cached links, sitemaps, recently-viewed entries) working.
  async findPublicDetail(slugOrDocumentId) {
    if (!slugOrDocumentId) return null;
    const bySlug = await strapi.documents('api::product.product').findFirst({
      status: 'published',
      filters: { slug: { $eq: slugOrDocumentId } },
      fields: DETAIL_FIELDS,
      populate: PUBLIC_POPULATE,
    });
    if (bySlug) return bySlug;
    return strapi.documents('api::product.product').findOne({
      documentId: slugOrDocumentId,
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
    const pinned = await this._pinnedProductIds();
    if (pinned.length === 0) return [];
    return strapi.documents('api::product.product').findMany({
      status: 'published',
      filters: { $and: [{ name: { $containsi: q } }, { id: { $in: pinned } }] },
      fields: DETAIL_FIELDS,
      populate: PUBLIC_POPULATE,
      pagination: { pageSize },
    });
  },

  async findPublicHighestPrice() {
    const pinned = await this._pinnedProductIds();
    if (pinned.length === 0) return null;
    const results = await strapi.documents('api::product.product').findMany({
      status: 'published',
      filters: { id: { $in: pinned } },
      sort: ['selling_price:DESC', 'id:ASC'],
      fields: DETAIL_FIELDS,
      populate: PUBLIC_POPULATE,
      pagination: { pageSize: 1 },
    });
    return results?.[0] ?? null;
  },

  async findPublicList({ filter = {}, page = 1, pageSize = 24 } = {}) {
    const baseFilters = buildListFilters(filter);
    const sort = buildListSort(filter);
    const pinned = await this._pinnedProductIds();
    if (pinned.length === 0) {
      return { data: [], meta: { pagination: { page, pageSize, pageCount: 1, total: 0 } } };
    }
    const pinnedClause = { id: { $in: pinned } };
    const filters = baseFilters.$and
      ? { $and: [...baseFilters.$and, pinnedClause] }
      : { $and: [pinnedClause, ...(Object.keys(baseFilters).length ? [baseFilters] : [])] };

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
