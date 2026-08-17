'use strict';

const { createCoreService } = require('@strapi/strapi').factories;
const { ACTIVE_PRODUCT_FILTER } = require('../../../utils/active-product');
const { NOT_A_VARIANT, imagedProductIdSet, hasAnyImage } = require('../../../utils/public-product');
const { decodeShortCode, SHORT_LINK_PREFIX } = require('@rutba/api-provider/lib/short-code.cjs');

// First path segment of a storefront product link, in every form we publish:
// the canonical `/product/<slug>`, the printed `/qr/<code>` on labels and
// packaging, and the short `/s/<code>` — taken from the codec so a prefix
// change there can't silently stop captions being de-duplicated.
const STOREFRONT_SEGMENTS = new Set([
  'product',
  'qr',
  SHORT_LINK_PREFIX.replace(/^\/+/, ''),
]);

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

/**
 * The part of a search query that could be an identifier, or null when the
 * query is plainly prose.
 *
 * A phone camera pointed at a QR code hands its owner a URL, not a code, and
 * that URL is what gets pasted into the search box — so a pasted
 * `…/s/<code>`, `…/qr/<code>` or `…/product/<slug>` is reduced to its last
 * path segment. Anything containing whitespace is a phrase, and phrases are
 * names: no identifier in this system has a space in it.
 */
function identifierToken(query) {
  const q = String(query ?? '').trim();
  if (!q || /\s/.test(q)) return null;

  if (/^https?:\/\//i.test(q)) {
    let url;
    try {
      url = new URL(q);
    } catch {
      return null;
    }
    const last = url.pathname.split('/').filter(Boolean).pop();
    if (!last) return null;
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  }

  return q;
}

/**
 * Remove links back to the storefront from a social caption.
 *
 * Share targets take text and URL as separate arguments and compose them, so a
 * caption that still carries `…/s/<code>` posts the same link twice. A line
 * left empty once its URL is gone was only ever a label for it ("🛒 Shop now:")
 * and goes with it.
 *
 * Origin-agnostic: captions in one database can carry several origins
 * (localhost, the LAN box, rutba.pk) depending on where they were authored, and
 * all of them are the same link as far as the reader is concerned.
 */
function stripStorefrontLinks(body) {
  if (!body) return null;

  const kept = [];
  for (const line of String(body).split('\n')) {
    let removed = false;
    const stripped = line.replace(/https?:\/\/[^\s<>"'`]+/gi, (raw) => {
      let url;
      try {
        url = new URL(raw.replace(/[.,;:!?)\]}]*$/, ''));
      } catch {
        return raw;
      }
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length !== 2 || !STOREFRONT_SEGMENTS.has(segments[0])) return raw;
      removed = true;
      return '';
    });

    // "🛒 Shop now:" existed only to introduce the link. Left on its own it
    // reads like the caption was truncated, so it goes with the URL.
    const trimmed = stripped.trim();
    if (removed && (!trimmed || /[:\-–—]$/.test(trimmed))) continue;

    kept.push(stripped.replace(/[ \t]+$/, ''));
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim() || null;
}

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
      limit: 1000,
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

  /**
   * The brand's own words for a product, for the storefront's share sheet.
   *
   * When a shopper shares a product we would rather hand them the caption the
   * brand already wrote and posted than a machine-assembled one — it is written
   * for social, it carries the tone and hashtags, and it has already proven
   * acceptable in public.
   *
   * Only posts that actually went out qualify: `published_at_social` must be
   * set. This endpoint is unauthenticated, so a looser rule would publish
   * scheduled-but-unposted campaign copy to anyone who asked for it. A product
   * with no posted caption returns null and the storefront falls back to its
   * own summary.
   *
   * The product's own links are stripped from the caption. Every share target
   * takes text and URL as separate arguments and composes them itself, so
   * leaving the link in produces the URL twice.
   */
  async findPublicShareCaption(slugOrDocumentId) {
    if (!slugOrDocumentId) return null;

    const product = await strapi.documents('api::product.product').findFirst({
      status: 'published',
      fields: ['name'],
      filters: {
        $and: [
          { $or: [{ slug: { $eq: slugOrDocumentId } }, { documentId: { $eq: slugOrDocumentId } }] },
          ACTIVE,
        ],
      },
    });
    if (!product) return null;

    const posts = await strapi.documents('api::social-post.social-post').findMany({
      status: 'published',
      filters: {
        $and: [
          { products: { documentId: { $eq: product.documentId } } },
          { published_at_social: { $notNull: true } },
        ],
      },
      fields: ['title', 'body', 'published_at_social'],
      sort: ['published_at_social:desc'],
      // Flat `limit`, never `pagination:{...}` — the document service strips the
      // nested form ("accepted then stripped"), so a nested cap silently reads
      // EVERY matching row. Public route: that must stay bounded.
      limit: 1,
    });

    const post = posts?.[0];
    const caption = stripStorefrontLinks(post?.body);
    if (!caption) return null;

    return { caption, title: post.title || null, posted_at: post.published_at_social ?? null };
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
      limit: Math.max(cleanIds.length, 1),
    });
  },

  /**
   * Storefront search.
   *
   * Names are what most people type, but not all of them: a customer with the
   * product in front of them types what is printed on it (SKU, barcode), and a
   * customer who scanned a QR or was sent a short link pastes a URL. None of
   * those contain the product's name, so a name-only search answers "no
   * results" to someone holding the exact item — the worst possible moment to
   * say it. Exact identifier matches are resolved first and pinned to the top;
   * the name search is unchanged and supplies the rest.
   *
   * Identifier matches obey the same sellable/active/not-a-variant gate as
   * every other storefront list. That is deliberately stricter than
   * `/qr/<code>` and `/s/<code>`, which resolve any published product and let
   * the detail page say "temporarily offline": a scanned label is a promise the
   * page exists, whereas search is an offer to sell.
   */
  async findPublicSearch(query, pageSize = 5) {
    const q = (query ?? '').trim();
    if (q.length === 0) return [];
    const sellable = await this._sellableProductIds();
    if (sellable.length === 0) return [];

    const gate = [{ id: { $in: sellable } }, ACTIVE, NOT_A_VARIANT];
    const read = (filters) => strapi.documents('api::product.product').findMany({
      status: 'published',
      filters: { $and: [filters, ...gate] },
      fields: DETAIL_FIELDS,
      populate: PUBLIC_POPULATE,
      limit: pageSize,
    });

    const token = identifierToken(q);

    // Unambiguous identifiers: a value equal to one of these was printed on or
    // assigned to exactly this product, so it outranks any name that merely
    // contains the same letters.
    const exact = token
      ? await read({
        // $eqi throughout: a SKU read off a label and typed back in rarely
        // comes back in the case it was stored in.
        $or: [
          { qr_code: { $eqi: token } },
          { sku: { $eqi: token } },
          { barcode: { $eqi: token } },
          { slug: { $eqi: token } },
          { documentId: { $eqi: token } },
        ],
      })
      : [];

    const byName = await read({ name: { $containsi: q } });

    // Short codes go last, and only when nothing else answered. Most short
    // words are valid Base32 — "sale" decodes to 829486 — so a decode that
    // happens to hit a live product id must never displace a real name match.
    let byShortCode = [];
    if (exact.length === 0 && byName.length === 0) {
      const id = decodeShortCode(token ?? '');
      if (id !== null) byShortCode = await read({ id: { $eq: id } });
    }

    // Same product can arrive from two passes (a slug hit that also matches by
    // name); first occurrence wins, which is the more authoritative one.
    const seen = new Set();
    const merged = [];
    for (const row of [...exact, ...byShortCode, ...byName]) {
      if (seen.has(row.documentId)) continue;
      seen.add(row.documentId);
      merged.push(row);
      if (merged.length >= pageSize) break;
    }
    return merged;
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
      limit: 1,
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
        // start/limit, not page/pageSize and not a nested `pagination:{...}`.
        // Both of the other forms are accepted and then dropped: `pagination`
        // never reaches the query transformer (pickAllowedQueryParams), and
        // flat page/pageSize survive it only to be discarded by the db query
        // builder, which reads `offset`/`limit` and nothing else — page/pageSize
        // are translated exclusively by `findPage`, which documents() never
        // calls. Either way no LIMIT was emitted and every page returned the
        // whole catalogue.
        start: (page - 1) * pageSize,
        limit: pageSize,
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
