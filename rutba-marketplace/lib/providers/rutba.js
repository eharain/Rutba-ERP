'use strict';

// Rutba provider adapter — a *second Rutba ERP instance* (e.g. the public online
// store) treated as just another marketplace, app-side.
//
// Unlike Daraz there is NO OAuth and NO signing: the target is a Strapi we own,
// reached with a plain API token. The engine calls the same contract as every
// other adapter; the differences are:
//   • capabilities.catalog means we push the FULL product (variants + media +
//     categories), not just price/stock — the online instance may not have the
//     product yet. pushCatalog does the create/upsert; pushInventory keeps
//     price+stock fresh afterwards.
//   • identity is the origin documentId (carried in the payload + echoed back as
//     external_id), never the barcode — see the online ingest util.
//
// Connection config is per-account:
//   account.extra_config.base_url  → the target Strapi API base (…/api)
//   account.api_key                → a Strapi API token on the target
// with optional app-level fallbacks in config.providers.rutba (dev/single-target).

const base = require('./base');

const PLATFORM = 'rutba';

/** { baseUrl, token } for an account — account fields win over app config. */
function connection(account) {
  const cfg = base.getProviderConfig(PLATFORM);
  const baseUrl = String(base.extra(account, 'base_url') || cfg.apiUrl || '').replace(/\/+$/, '');
  const token = (account && account.api_key) || cfg.token || '';
  if (!baseUrl) {
    throw new base.ProviderError('Rutba target is not configured (extra_config.base_url)', { platform: PLATFORM });
  }
  if (!token) {
    throw new base.ProviderError('Rutba target API token is missing (account.api_key)', { platform: PLATFORM });
  }
  return { baseUrl, token };
}

/** Thin REST call to the target Strapi, authenticated with the account's token. */
async function req(account, method, path, { query, json } = {}) {
  const { baseUrl, token } = connection(account);
  return base.httpRequest(`${baseUrl}${path}`, {
    method,
    platform: PLATFORM,
    query,
    json,
    headers: { Authorization: `Bearer ${token}` },
  });
}

module.exports = {
  key: PLATFORM,
  label: 'Rutba (online instance)',
  // No oauth, no fulfillment push in phase 1. catalog=true unlocks pushCatalog
  // in the engine (full product upsert); orders=true pulls the target's web
  // orders back for local processing.
  capabilities: { oauth: false, orders: true, inventory: true, fulfillment: false, catalog: true },

  // Rutba↔Rutba taxonomy is matched by slug on the target side (find-or-create),
  // so there is nothing for the operator to hand-map — the mapping UI renders no
  // dimensions for this platform.
  catalogSpec: {
    label: 'Rutba (online instance)',
    autoMatch: true,
    dimensions: [],
  },

  /** Cheap liveness/credential check — the target echoes its own identity. */
  async validateConnection({ account }) {
    const data = await req(account, 'GET', '/products/integration/ping');
    return { ok: true, target: (data && (data.data || data)) || null };
  },

  /**
   * Full catalog upsert. `products` are already price-adjusted by the engine and
   * carry origin_document_id (the in-house documentId — the identity key the
   * target matches on). Returns { results: [{ origin_document_id, sku, ok,
   * external_id, error }] } so the engine can stamp each listing with the online
   * documentId.
   */
  async pushCatalog({ account, products }) {
    const rows = (products || []).filter(Boolean);
    if (!rows.length) return { results: [] };
    let data;
    try {
      data = await req(account, 'POST', '/products/integration/ingest-catalog', {
        json: { origin_account_id: account.documentId, products: rows },
      });
    } catch (e) {
      return { results: rows.map((p) => ({ origin_document_id: p.origin_document_id, sku: p.sku, ok: false, error: e.message })) };
    }
    const payload = (data && (data.data || data)) || {};
    return { results: Array.isArray(payload.results) ? payload.results : [] };
  },

  /**
   * Price + stock refresh for products the target already has. Matches the
   * generic adapter contract ({ sku, quantity, price, salePrice }); the target
   * resolves each sku to its product and updates it. Returns { results }.
   */
  async pushInventory({ account, updates }) {
    const rows = (updates || []).filter((u) => u && u.sku != null);
    if (!rows.length) return { results: [] };
    let data;
    try {
      data = await req(account, 'POST', '/products/integration/update-inventory', { json: { updates: rows } });
    } catch (e) {
      return { results: rows.map((u) => ({ sku: u.sku, ok: false, error: e.message })) };
    }
    const payload = (data && (data.data || data)) || {};
    return { results: Array.isArray(payload.results) ? payload.results : rows.map((u) => ({ sku: u.sku, ok: true })), raw: payload };
  },

  /**
   * Pull the target's own storefront orders (channel='web') changed since the
   * watermark. Items are returned inline, so the engine never needs
   * fetchOrderItems. Shape matches the normalized order the ingest service maps
   * into a local sale-order.
   */
  async fetchOrders({ account, since, limit = 100 }) {
    const query = { limit: Math.min(Number(limit) || 100, 200) };
    if (since) query.since = new Date(since).toISOString();
    const data = await req(account, 'GET', '/sale-orders/integration/export', { query });
    const payload = (data && (data.data || data)) || {};
    const orders = Array.isArray(payload.orders) ? payload.orders : (Array.isArray(payload) ? payload : []);
    return orders;
  },
};
