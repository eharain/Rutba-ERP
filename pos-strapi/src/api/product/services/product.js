'use strict';

const { createCoreService } = require('@strapi/strapi').factories;
const { ACTIVE_PRODUCT_FILTER } = require('../../../utils/active-product');
const { NOT_A_VARIANT, imagedProductIdSet, hasAnyImage } = require('../../../utils/public-product');

// Drafts of nested relations can slip through Strapi 5 populate trees even
// when the parent is fetched as published.
const PUBLISHED = { publishedAt: { $notNull: true } };

// Every read below is storefront-facing, so all of them AND this in: a
// deactivated product (or variant) is invisible to the web, published or not.
const ACTIVE = ACTIVE_PRODUCT_FILTER;

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
    // Published AND active — a deactivated variant must not be selectable on
    // the product page even when its parent is on sale.
    filters: { $and: [PUBLISHED, ACTIVE] },
    fields: VARIANT_FIELDS,
    populate: {
      gallery: true,
      logo: true,
      terms: { populate: { term_types: true } },
    },
  },
};

// Detail pages additionally need SEO metadata and the parent (variant pages
// compose their <title> as "parent — variant"). Kept off PUBLIC_POPULATE so
// list/search responses stay lean.
const DETAIL_POPULATE = {
  ...PUBLIC_POPULATE,
  seo_meta: { populate: { og_image: true } },
  // Parent media ride along so a variant page can answer the availability
  // image check ("does anything on this page have a photo?") without a
  // second query.
  parent: { fields: ['name', 'slug'], populate: { gallery: true, logo: true } },
};

// NOT_A_VARIANT and the has-image gate both live in utils/public-product —
// shared with the product-group and cms-page surfaces so "listable" means the
// same thing everywhere.

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

  // The full listable gate: pinned AND carrying at least one image. Everything
  // the storefront renders as a card goes through this so an image-less
  // product drops out of every grid the moment it's noticed, and returns the
  // moment someone uploads a photo.
  async _sellableProductIds() {
    const pinned = await this._pinnedProductIds();
    if (pinned.length === 0) return [];
    return Array.from(await imagedProductIdSet(strapi, pinned));
  },

  // Detail pages stay reachable for any published+active product (printed QR
  // labels resolve there), but the storefront needs to know whether to offer
  // purchase. `online: false` renders as "temporarily offline": no Add to
  // Cart, noindex. `groups` carries the published groups this product (or its
  // parent, for variants) belongs to, so the offline view can offer the
  // shopper somewhere to go instead of a dead end.
  async publicAvailabilityFor(product) {
    if (!product) return null;
    const reasons = [];

    // Image leg: own images, a variant's, or — on a variant page — the
    // parent's. All populated by DETAIL_POPULATE, so no extra query.
    const parentHasImage =
      (product.parent?.gallery?.length ?? 0) > 0 || !!product.parent?.logo;
    if (!hasAnyImage(product) && !parentHasImage) reasons.push('no-image');

    // Listed leg: pinned in a published product-group. Variants inherit their
    // parent's pinning — they are sold from the parent's page.
    const documentId =
      product.is_variant && product.parent?.documentId
        ? product.parent.documentId
        : product.documentId;
    const groups = await this._publishedGroupsFor(documentId);
    if (groups.length === 0) reasons.push('not-listed');

    return { online: reasons.length === 0, reasons, groups };
  },

  // The published groups a product document is pinned in — resolved against
  // the link table by documentId, so it holds regardless of which version row
  // (draft/published) the link rows reference. Doubles as the pinned check
  // (empty = not listed anywhere) and as the offline view's escape links.
  async _publishedGroupsFor(documentId) {
    if (!documentId) return [];
    const knex = strapi.db.connection;
    const rowIds = (
      await knex('products').where('document_id', documentId).select('id')
    ).map((r) => r.id);
    if (rowIds.length === 0) return [];
    const links = await knex('product_groups_products_lnk')
      .whereIn('product_id', rowIds)
      .select('product_group_id');
    const groupIds = [...new Set(links.map((l) => l.product_group_id))];
    if (groupIds.length === 0) return [];
    const rows = await knex('product_groups')
      .whereIn('id', groupIds)
      .whereNotNull('published_at')
      .select('document_id', 'name', 'title', 'slug');
    // One entry per document, storefront-ready: display label + URL slug.
    const seen = new Map();
    for (const g of rows) {
      if (!g.slug || seen.has(g.document_id)) continue;
      seen.set(g.document_id, { name: g.title || g.name || g.slug, slug: g.slug });
    }
    return [...seen.values()];
  },

  // Accepts either a slug or a documentId. We try slug first because that is
  // the canonical lookup going forward; falling back to documentId keeps any
  // pre-slug URLs (cached links, sitemaps, recently-viewed entries) working.
  async findPublicDetail(slugOrDocumentId) {
    if (!slugOrDocumentId) return null;
    const base = { status: 'published', fields: DETAIL_FIELDS, populate: DETAIL_POPULATE };
    const bySlug = await strapi.documents('api::product.product').findFirst({
      ...base,
      filters: { $and: [{ slug: { $eq: slugOrDocumentId } }, ACTIVE] },
    });
    if (bySlug) return bySlug;
    // documentId fallback goes through findFirst (not findOne) so the same
    // active filter applies — findOne takes no filters, and a deactivated
    // product must 404 on its legacy URL too.
    return strapi.documents('api::product.product').findFirst({
      ...base,
      filters: { $and: [{ documentId: { $eq: slugOrDocumentId } }, ACTIVE] },
    });
  },

  async findPublicByIds(ids = []) {
    const cleanIds = ids
      .map((v) => Number.parseInt(v, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (cleanIds.length === 0) return [];
    // Cart/wishlist rehydration: a product deactivated after it was added drops
    // out of the response, so it disappears from the cart instead of staying
    // buyable.
    return strapi.documents('api::product.product').findMany({
      status: 'published',
      filters: { $and: [{ id: { $in: cleanIds } }, ACTIVE] },
      fields: DETAIL_FIELDS,
      populate: PUBLIC_POPULATE,
      pagination: { pageSize: Math.max(cleanIds.length, 1) },
    });
  },

  async findPublicSearch(query, pageSize = 5) {
    const q = (query ?? '').trim();
    if (q.length === 0) return [];
    const sellable = await this._sellableProductIds();
    if (sellable.length === 0) return [];
    return strapi.documents('api::product.product').findMany({
      status: 'published',
      filters: { $and: [{ name: { $containsi: q } }, { id: { $in: sellable } }, ACTIVE, NOT_A_VARIANT] },
      fields: DETAIL_FIELDS,
      populate: PUBLIC_POPULATE,
      pagination: { pageSize },
    });
  },

  async findPublicHighestPrice() {
    const sellable = await this._sellableProductIds();
    if (sellable.length === 0) return null;
    const results = await strapi.documents('api::product.product').findMany({
      status: 'published',
      filters: { $and: [{ id: { $in: sellable } }, ACTIVE] },
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
    const sellable = await this._sellableProductIds();
    if (sellable.length === 0) {
      return { data: [], meta: { pagination: { page, pageSize, pageCount: 1, total: 0 } } };
    }
    // buildListFilters returns either {} or { $and: [...] }, so flattening its
    // clauses alongside the sellable + active gates keeps everything ANDed.
    const filters = { $and: [{ id: { $in: sellable } }, ACTIVE, NOT_A_VARIANT, ...(baseFilters.$and ?? [])] };

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
