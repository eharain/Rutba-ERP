'use strict';

// Server-side Strapi client for the engine (worker + API routes).
//
// Authenticates with a Strapi API token (config.strapi.token). Because the
// request carries no users-permissions *user*, the api-pro interceptor skips
// enforcement (see request-interceptor.js: "no authenticated user" → skipped),
// so these calls hit Strapi's core REST + the two API-token-gated marketplace
// endpoints directly. This is the ONLY path the engine uses to reach Strapi;
// the browser UI talks to Strapi separately via @rutba/api-provider.

const qs = require('qs');
const config = require('./config');

const BASE = config.strapi.apiUrl;

// Shared shape for the full catalog push (parents + variants use the same set).
const CATALOG_PRODUCT_FIELDS = [
  'name', 'slug', 'sku', 'barcode', 'summary', 'description',
  'cost_price', 'offer_price', 'selling_price', 'tax_rate', 'stock_quantity',
  'is_active', 'is_variant', 'unit_of_measure', 'kind', 'keywords', 'external_ids',
];
const CATALOG_MEDIA_FIELDS = ['url', 'name', 'alternativeText', 'mime', 'width', 'height', 'formats'];
function catalogPopulate() {
  return {
    categories: { fields: ['documentId', 'name', 'slug'] },
    brands: { fields: ['documentId', 'name', 'slug'] },
    terms: { fields: ['name', 'slug'] },
    logo: { fields: CATALOG_MEDIA_FIELDS },
    gallery: { fields: CATALOG_MEDIA_FIELDS },
    parent: { fields: ['documentId'] },
  };
}

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (config.strapi.token) h.Authorization = `Bearer ${config.strapi.token}`;
  return h;
}

async function sreq(method, path, { query, body } = {}) {
  let url = `${BASE}${path}`;
  if (query && Object.keys(query).length) {
    url += (url.includes('?') ? '&' : '?') + qs.stringify(query, { encodeValuesOnly: true });
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error(`[strapi] ${method} ${path} network error: ${e.message}`);
    err.cause = e;
    throw err;
  }
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `${res.status} ${res.statusText}`;
    const err = new Error(`[strapi] ${method} ${path} → ${msg}`);
    err.status = res.status;
    err.raw = data;
    throw err;
  }
  return data;
}

module.exports = {
  /** Active marketplace accounts (non-private fields only). */
  async listAccounts(filters = {}) {
    const r = await sreq('GET', '/marketplace-accounts', {
      query: { filters, pagination: { pageSize: 200 }, sort: ['createdAt:asc'] },
    });
    return r.data || [];
  },

  /** Full account incl. private credential fields — via the API-token-gated endpoint. */
  async getAccountSecrets(documentId) {
    const r = await sreq('GET', `/marketplace-accounts/${documentId}/secrets`);
    return r.data || r;
  },

  /** Patch an account (tokens, watermarks, flags). */
  async updateAccount(documentId, data) {
    const r = await sreq('PUT', `/marketplace-accounts/${documentId}`, { body: { data } });
    return r.data || r;
  },

  async createSyncLog(data) {
    const r = await sreq('POST', '/marketplace-sync-logs', { body: { data } });
    return r.data || r;
  },

  async updateSyncLog(documentId, data) {
    const r = await sreq('PUT', `/marketplace-sync-logs/${documentId}`, { body: { data } });
    return r.data || r;
  },

  /**
   * List our internal taxonomy entities (categories/brands/term-types/terms)
   * for the mapping UI. Fetched with the service token so the operator doesn't
   * need cross-domain (stock/cms) read grants — the module mediates.
   */
  async listInternalEntities(kind) {
    const PATHS = { category: '/categories', brand: '/brands', term_type: '/term-types', term: '/terms' };
    const path = PATHS[kind];
    if (!path) throw new Error(`Unknown entity kind: ${kind}`);
    const out = [];
    const pageSize = 200;
    for (let page = 1; page <= 25; page += 1) {
      const r = await sreq('GET', path, {
        query: { fields: ['name', 'slug'], pagination: { page, pageSize }, sort: ['name:asc'] },
      });
      const rows = r.data || [];
      for (const x of rows) out.push({ documentId: x.documentId, name: x.name, slug: x.slug });
      const pageCount = r.meta?.pagination?.pageCount || 1;
      if (page >= pageCount) break;
    }
    return out;
  },

  /** Hand a batch of normalized orders to Strapi for mapping → sale-orders. */
  async ingestOrders(accountDocumentId, orders) {
    const r = await sreq('POST', `/marketplace-accounts/${accountDocumentId}/ingest-orders`, {
      body: { orders },
    });
    return r.data || r;
  },

  /** All listings for an account (selected or not), product price/stock populated. */
  async listAllListings(accountDocumentId) {
    const r = await sreq('GET', '/marketplace-listings', {
      query: {
        filters: { marketplace_account: { documentId: { $eq: accountDocumentId } } },
        populate: { product: { fields: ['name', 'sku', 'selling_price', 'offer_price', 'stock_quantity', 'is_active'], populate: { categories: { fields: ['documentId'] } } } },
        pagination: { pageSize: 2000 },
      },
    });
    return r.data || [];
  },

  /** Products from the account's attached product-groups (Strapi populate returns published only). */
  async listAccountGroupProducts(accountDocumentId) {
    const r = await sreq('GET', `/marketplace-accounts/${accountDocumentId}`, {
      query: {
        populate: {
          product_groups: { populate: { products: { fields: ['name', 'sku', 'selling_price', 'offer_price', 'stock_quantity', 'is_active'], populate: { categories: { fields: ['documentId'] } } } } },
        },
      },
    });
    const acc = r.data || {};
    const map = new Map();
    for (const g of acc.product_groups || []) {
      for (const p of g.products || []) {
        if (p?.documentId && !map.has(p.documentId)) map.set(p.documentId, p);
      }
    }
    return [...map.values()];
  },

  async createListing(data) {
    const r = await sreq('POST', '/marketplace-listings', { body: { data } });
    return r.data || r;
  },

  /** Find an existing listing for (account, product), or null. */
  async findListing(accountDocumentId, productDocumentId) {
    const r = await sreq('GET', '/marketplace-listings', {
      query: {
        filters: {
          marketplace_account: { documentId: { $eq: accountDocumentId } },
          product: { documentId: { $eq: productDocumentId } },
        },
        fields: ['documentId'],
        pagination: { pageSize: 1 },
      },
    });
    return (r.data && r.data[0]) || null;
  },

  /**
   * Authoritative PUBLISHED product data for the given documentIds — the publish
   * gate. A direct /products find returns published only (draft versions are
   * excluded), unlike a nested relation populate, so drafts never reach the
   * marketplace.
   */
  async getPublishedProducts(documentIds) {
    const ids = [...new Set((documentIds || []).filter(Boolean))];
    if (!ids.length) return [];
    const out = [];
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const r = await sreq('GET', '/products', {
        query: {
          filters: { documentId: { $in: batch } },
          status: 'published',
          fields: ['name', 'sku', 'selling_price', 'offer_price', 'stock_quantity', 'is_active'],
          populate: { categories: { fields: ['documentId'] } },
          pagination: { pageSize: 100 },
        },
      });
      out.push(...(r.data || []));
    }
    return out;
  },

  /**
   * Rich PUBLISHED product data for a full catalog push (Rutba-target only):
   * the fields the online instance needs to CREATE a product, not just update
   * price/stock — barcode, descriptions, unit/kind, categories+brands (by slug,
   * so the target find-or-creates them), media (logo+gallery URLs — synced as
   * references, the binaries already live on the shared media host), and the
   * `parent` link (documentId) so a selected variant can be resolved back to the
   * product that owns it. Published-only (status='published'): a direct find
   * excludes drafts, so a draft product/variant never reaches the marketplace.
   * Variants themselves are fetched separately via getPublishedVariants — a
   * nested relation populate would leak DRAFT variants, which this avoids.
   */
  async getCatalogProducts(documentIds) {
    const ids = [...new Set((documentIds || []).filter(Boolean))];
    if (!ids.length) return [];
    const out = [];
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const r = await sreq('GET', '/products', {
        query: {
          filters: { documentId: { $in: batch } },
          status: 'published',
          fields: CATALOG_PRODUCT_FIELDS,
          populate: catalogPopulate(),
          pagination: { pageSize: 50 },
        },
      });
      out.push(...(r.data || []));
    }
    return out;
  },

  /**
   * PUBLISHED variants (own product rows) whose parent is in the given set —
   * fetched directly (not via a parent populate) so drafts are excluded. Used to
   * push a parent's full, live variant set nested under it.
   */
  async getPublishedVariants(parentDocumentIds) {
    const ids = [...new Set((parentDocumentIds || []).filter(Boolean))];
    if (!ids.length) return [];
    const out = [];
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const r = await sreq('GET', '/products', {
        query: {
          filters: { parent: { documentId: { $in: batch } } },
          status: 'published',
          fields: CATALOG_PRODUCT_FIELDS,
          populate: catalogPopulate(),
          pagination: { pageSize: 500 },
        },
      });
      out.push(...(r.data || []));
    }
    return out;
  },

  /** Live marketplace offer prices for the given products: { [documentId]: { finalPrice, offerName } }. */
  async fetchOfferPrices(accountDocumentId, productDocumentIds) {
    const r = await sreq('POST', `/marketplace-accounts/${accountDocumentId}/offer-prices`, { body: { productDocumentIds } });
    return r.data || {};
  },

  /** Active per-category price rules for an account (highest priority first). */
  async listPriceRules(accountDocumentId) {
    const r = await sreq('GET', '/marketplace-price-rules', {
      query: {
        filters: { marketplace_account: { documentId: { $eq: accountDocumentId } }, is_active: { $eq: true } },
        populate: { category: { fields: ['documentId', 'name'] } },
        sort: ['priority:desc'],
        pagination: { pageSize: 500 },
      },
    });
    return r.data || [];
  },

  async updateListing(documentId, data) {
    const r = await sreq('PUT', `/marketplace-listings/${documentId}`, { body: { data } });
    return r.data || r;
  },

  /** Our products for the selection UI (paginated, optional name/sku search). */
  async listProducts({ page = 1, pageSize = 50, q } = {}) {
    const filters = {};
    if (q) filters.$or = [{ name: { $containsi: q } }, { sku: { $containsi: q } }];
    const r = await sreq('GET', '/products', {
      query: {
        filters,
        fields: ['name', 'sku', 'selling_price', 'offer_price', 'stock_quantity', 'is_active'],
        sort: ['name:asc'],
        pagination: { page, pageSize },
      },
    });
    return { items: r.data || [], pagination: r.meta?.pagination || {} };
  },

  /** Product-groups for the account's publish-set selector. */
  async listProductGroups() {
    const out = [];
    for (let page = 1; page <= 20; page += 1) {
      const r = await sreq('GET', '/product-groups', {
        query: { fields: ['name', 'title', 'slug'], sort: ['name:asc'], pagination: { page, pageSize: 200 } },
      });
      const rows = r.data || [];
      for (const g of rows) out.push({ documentId: g.documentId, name: g.title || g.name || g.slug });
      const pageCount = r.meta?.pagination?.pageCount || 1;
      if (page >= pageCount) break;
    }
    return out;
  },
};
