'use strict';

// Marketplace orchestration engine (app-side). The only caller of the provider
// adapters; talks to Strapi via the API-token client (lib/strapi.js). Drives:
// OAuth connect/refresh, order pulls (→ Strapi ingest endpoint), inventory
// pushes, and the cron loops invoked by the built-in worker (instrumentation.js)
// and the manual-trigger API routes.
//
// Ported from the retired pos-strapi orchestration service; strapi.documents()
// calls became HTTP calls through lib/strapi.js.

const crypto = require('crypto');
const providers = require('./providers');
const base = require('./providers/base');
const strapi = require('./strapi');

const FIRST_RUN_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const INVENTORY_BATCH = 50;

function msg(e) {
  if (!e) return 'Unknown error';
  if (e instanceof base.ProviderError && e.status) return `${e.message} (HTTP ${e.status})`;
  return e.message || String(e);
}

/** Persist an adapter's accountPatch; extra_config is shallow-merged. */
async function applyAccountPatch(account, patch) {
  if (!patch || typeof patch !== 'object') return account;
  const data = {};
  for (const k of ['access_token', 'refresh_token', 'token_expires_at', 'refresh_expires_at', 'seller_id', 'account_name']) {
    if (patch[k] !== undefined) data[k] = patch[k];
  }
  if (patch.extra_config && typeof patch.extra_config === 'object') {
    data.extra_config = { ...(account.extra_config || {}), ...patch.extra_config };
  }
  if (Object.keys(data).length === 0) return account;
  await strapi.updateAccount(account.documentId, data);
  return { ...account, ...data };
}

async function ensureFreshToken(account) {
  try {
    if (!base.tokenExpired(account, 300)) return account;
    const adapter = providers.getAdapter(account.platform);
    if (!adapter.capabilities?.oauth || typeof adapter.refreshToken !== 'function') return account;
    const patch = await adapter.refreshToken({ account });
    if (!patch) return account;
    return applyAccountPatch(account, patch);
  } catch (e) {
    console.warn(`[marketplace] token refresh failed for ${account?.platform} ${account?.documentId}: ${msg(e)}`);
    return account;
  }
}

// ── OAuth ──────────────────────────────────────────────────────────────────────

async function buildConnectUrl(accountDocumentId) {
  const account = await strapi.getAccountSecrets(accountDocumentId);
  if (!account) throw new Error('Account not found');
  const adapter = providers.getAdapter(account.platform);
  if (!adapter.capabilities?.oauth) throw new Error(`${adapter.label} OAuth is not supported`);

  const nonce = crypto.randomBytes(16).toString('hex');
  const state = `${account.documentId}.${nonce}`;
  await strapi.updateAccount(account.documentId, {
    extra_config: { ...(account.extra_config || {}), oauth_nonce: nonce },
  });
  const url = adapter.getAuthUrl({ account, state });
  return { url };
}

async function handleOAuthCallback({ state, code, error, error_description }) {
  if (error) throw new Error(error_description || error);
  if (!state || !code) throw new Error('Missing state or code');
  const [accountDocumentId, nonce] = String(state).split('.');
  const account = await strapi.getAccountSecrets(accountDocumentId);
  if (!account) throw new Error('Unknown account in OAuth state');
  const storedNonce = base.extra(account, 'oauth_nonce');
  if (!storedNonce || !nonce || storedNonce !== nonce) {
    throw new Error('OAuth state is invalid or has already been used');
  }
  const adapter = providers.getAdapter(account.platform);
  const patch = await adapter.exchangeCode({ account, code });
  await applyAccountPatch(account, {
    ...patch,
    extra_config: { ...(patch?.extra_config || {}), connected_at: new Date().toISOString(), oauth_nonce: null },
  });
  await strapi.updateAccount(account.documentId, { is_active: true, last_connected_at: new Date().toISOString() });
  return { platform: account.platform, account_name: patch.account_name || account.account_name };
}

async function validateConnection(accountDocumentId) {
  let account = await strapi.getAccountSecrets(accountDocumentId);
  if (!account) throw new Error('Account not found');
  if (!account.access_token) return { ok: false, reason: 'Not connected — run the OAuth connect flow first.' };
  account = await ensureFreshToken(account);
  return { ok: true, platform: account.platform, account_name: account.account_name, token_expires_at: account.token_expires_at || null };
}

async function refreshAccountToken(accountDocumentId) {
  const account = await strapi.getAccountSecrets(accountDocumentId);
  if (!account) throw new Error('Account not found');
  const adapter = providers.getAdapter(account.platform);
  if (typeof adapter.refreshToken !== 'function') return { refreshed: false };
  const patch = await adapter.refreshToken({ account });
  if (!patch) return { refreshed: false };
  await applyAccountPatch(account, patch);
  return { refreshed: true };
}

// ── catalog taxonomy (for the category/brand mapping layer) ──────────────────

// Per-provider mapping spec — the UI renders its dimensions, so each
// marketplace's taxonomy shape (Daraz tree+attributes vs a flat list, etc.) is
// declared by its adapter, never hardcoded in the UI.
function getCatalogSpec(platform) {
  const adapter = providers.getAdapter(platform);
  return adapter.catalogSpec || { label: adapter.label || platform, dimensions: [] };
}

// Pull a marketplace's taxonomy so the operator can map our categories/brands/
// terms onto it. Read-only — persisting the chosen mappings is plain datastore
// CRUD the UI does via @rutba/api-provider against marketplace-mappings.
async function pullTaxonomy(accountDocumentId, kind = 'category', opts = {}) {
  let account = await strapi.getAccountSecrets(accountDocumentId);
  if (!account) throw new Error('Account not found');
  account = await ensureFreshToken(account);
  const adapter = providers.getAdapter(account.platform);
  if (!adapter.capabilities?.catalog) throw new Error(`${adapter.label} catalog API is not supported`);
  switch (kind) {
    case 'category':
      return { kind, items: await adapter.fetchCategoryTree({ account }) };
    case 'brand':
      return { kind, items: await adapter.fetchBrands({ account, offset: Number(opts.offset) || 0, limit: Number(opts.limit) || 100 }) };
    case 'category_attributes':
      return { kind, items: await adapter.fetchCategoryAttributes({ account, categoryId: opts.categoryId }) };
    default:
      throw new Error(`Unsupported taxonomy kind: ${kind}`);
  }
}

// ── orders ───────────────────────────────────────────────────────────────────

async function syncOrdersForAccount(accountDocumentId) {
  let account = await strapi.getAccountSecrets(accountDocumentId);
  if (!account) throw new Error('Account not found');
  if (!account.is_active) return { skipped: true, reason: 'inactive' };
  account = await ensureFreshToken(account);
  const adapter = providers.getAdapter(account.platform);
  if (!adapter.capabilities?.orders) return { skipped: true, reason: 'orders not supported' };

  const log = await strapi.createSyncLog({
    marketplace_account: account.documentId, platform: account.platform,
    kind: 'orders', status: 'running', started_at: new Date().toISOString(),
  });
  const runStartedAt = new Date().toISOString();
  const since = account.last_orders_synced_at
    ? new Date(account.last_orders_synced_at).toISOString()
    : new Date(Date.now() - FIRST_RUN_LOOKBACK_MS).toISOString();

  const counts = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
  let detail = [];
  try {
    const orders = await adapter.fetchOrders({ account, since, limit: 100 });
    counts.fetched = orders.length;

    // Daraz returns orders without line items — pull them per order before
    // handing the batch to Strapi (which has no marketplace access of its own).
    for (const o of orders) {
      if ((!o.items || !o.items.length) && typeof adapter.fetchOrderItems === 'function') {
        try {
          o.items = await adapter.fetchOrderItems({ account, externalOrderId: o.externalOrderId });
        } catch (e) {
          o.items = [];
          o._itemsError = msg(e);
        }
      }
    }

    if (orders.length) {
      const res = await strapi.ingestOrders(account.documentId, orders);
      const results = Array.isArray(res?.results) ? res.results : [];
      for (const r of results) {
        const a = r.action || 'failed';
        counts[a] = (counts[a] || 0) + 1;
      }
      detail = results;
    }

    await strapi.updateAccount(account.documentId, { last_orders_synced_at: runStartedAt });
    const status = counts.failed > 0 ? (counts.created + counts.updated > 0 ? 'partial' : 'error') : 'success';
    await strapi.updateSyncLog(log.documentId, { status, ...counts, detail, finished_at: new Date().toISOString() });
    return { ...counts, status };
  } catch (e) {
    await strapi.updateSyncLog(log.documentId, { status: 'error', ...counts, error: msg(e).slice(0, 2000), detail, finished_at: new Date().toISOString() });
    throw e;
  }
}

// ── inventory ────────────────────────────────────────────────────────────────

async function syncInventoryForAccount(accountDocumentId) {
  let account = await strapi.getAccountSecrets(accountDocumentId);
  if (!account) throw new Error('Account not found');
  if (!account.is_active) return { skipped: true, reason: 'inactive' };
  account = await ensureFreshToken(account);
  const adapter = providers.getAdapter(account.platform);
  if (!adapter.capabilities?.inventory) return { skipped: true, reason: 'inventory not supported' };

  const matchAll = !!base.extra(account, 'inventory_match_all', false);
  const log = await strapi.createSyncLog({
    marketplace_account: account.documentId, platform: account.platform,
    kind: 'inventory', status: 'running', started_at: new Date().toISOString(),
  });
  const counts = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
  const detail = [];
  try {
    const products = await strapi.listedProducts(account.platform, matchAll);
    counts.fetched = products.length;
    const updates = products.map((p) => ({ sku: p.sku, quantity: Number(p.stock_quantity) || 0 }));

    for (let i = 0; i < updates.length; i += INVENTORY_BATCH) {
      const batch = updates.slice(i, i + INVENTORY_BATCH);
      const { results } = await adapter.pushInventory({ account, updates: batch });
      for (const r of results || []) {
        if (r.ok) counts.updated += 1;
        else { counts.failed += 1; detail.push({ sku: r.sku, error: r.error }); }
      }
    }

    await strapi.updateAccount(account.documentId, { last_inventory_synced_at: new Date().toISOString() });
    const status = counts.failed > 0 ? (counts.updated > 0 ? 'partial' : 'error') : 'success';
    await strapi.updateSyncLog(log.documentId, { status, ...counts, detail, finished_at: new Date().toISOString() });
    return { ...counts, status };
  } catch (e) {
    await strapi.updateSyncLog(log.documentId, { status: 'error', ...counts, error: msg(e).slice(0, 2000), detail, finished_at: new Date().toISOString() });
    throw e;
  }
}

// ── cron drivers ───────────────────────────────────────────────────────────────

async function syncAllOrders() {
  const accounts = await strapi.listAccounts({ is_active: { $eq: true }, sync_orders_enabled: { $eq: true } });
  let created = 0;
  for (const a of accounts) {
    try { const r = await syncOrdersForAccount(a.documentId); created += r.created || 0; }
    catch (e) { console.warn(`[marketplace] cron syncOrders ${a.documentId} failed: ${msg(e)}`); }
  }
  return { accounts: accounts.length, created };
}

async function syncAllInventory() {
  const accounts = await strapi.listAccounts({ is_active: { $eq: true }, sync_inventory_enabled: { $eq: true } });
  let updated = 0;
  for (const a of accounts) {
    try { const r = await syncInventoryForAccount(a.documentId); updated += r.updated || 0; }
    catch (e) { console.warn(`[marketplace] cron syncInventory ${a.documentId} failed: ${msg(e)}`); }
  }
  return { accounts: accounts.length, updated };
}

async function refreshExpiringTokens() {
  const accounts = await strapi.listAccounts({ is_active: { $eq: true } });
  let refreshed = 0;
  for (const a of accounts) {
    const full = await strapi.getAccountSecrets(a.documentId);
    if (!full?.token_expires_at) continue;
    if (!base.tokenExpired(full, 3600)) continue;
    const after = await ensureFreshToken(full);
    if (after !== full) refreshed += 1;
  }
  return { refreshed };
}

module.exports = {
  buildConnectUrl,
  handleOAuthCallback,
  validateConnection,
  refreshAccountToken,
  getCatalogSpec,
  pullTaxonomy,
  syncOrdersForAccount,
  syncInventoryForAccount,
  syncAllOrders,
  syncAllInventory,
  refreshExpiringTokens,
  _msg: msg,
};
