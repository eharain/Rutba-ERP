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

  /**
   * Products to push stock for. Listing flow (phase 2) sets
   * product.external_ids[platform]; until then matchAll pushes every active
   * SKU'd product. Paginates the core /products endpoint and filters in JS
   * (JSON-column key presence isn't cleanly queryable in Strapi filters).
   */
  async listedProducts(platform, matchAll) {
    const out = [];
    const pageSize = 200;
    const MAX_PAGES = 50; // safety cap → 10k products
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const r = await sreq('GET', '/products', {
        query: {
          filters: { sku: { $notNull: true }, ...(matchAll ? { is_active: true } : {}) },
          fields: ['sku', 'stock_quantity', 'external_ids', 'is_active'],
          pagination: { page, pageSize },
        },
      });
      const rows = r.data || [];
      for (const p of rows) {
        if (!p.sku) continue;
        if (matchAll) { out.push(p); continue; }
        const ext = p.external_ids;
        if (ext && typeof ext === 'object' && ext[platform]) out.push(p);
      }
      const pageCount = r.meta?.pagination?.pageCount || 1;
      if (page >= pageCount) break;
      if (page === MAX_PAGES) {
        console.warn(`[marketplace] listedProducts truncated at ${MAX_PAGES * pageSize} products`);
      }
    }
    return out;
  },
};
