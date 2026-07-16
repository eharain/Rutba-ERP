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
  const adapter = providers.getAdapter(account.platform);
  // Non-OAuth adapters (a peer Rutba instance) carry no access_token — they
  // authenticate with a stored API token and probe the target directly.
  if (adapter.capabilities?.oauth === false && typeof adapter.validateConnection === 'function') {
    try {
      const r = await adapter.validateConnection({ account });
      return { ok: !!(r && r.ok), platform: account.platform, account_name: account.account_name, target: (r && r.target) || null };
    } catch (e) {
      return { ok: false, reason: msg(e) };
    }
  }
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

// Toggle the account's enable flags (operator-facing "enable buttons"). Sync
// (manual + cron) is gated on these, so an account does nothing until enabled.
async function setAccountEnabled(accountDocumentId, flags = {}) {
  const data = {};
  for (const k of ['is_active', 'sync_orders_enabled', 'sync_inventory_enabled']) {
    if (typeof flags[k] === 'boolean') data[k] = flags[k];
  }
  if (Object.keys(data).length === 0) throw new Error('No enable flag provided');
  await strapi.updateAccount(accountDocumentId, data);
  return data;
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
  if (!account.is_active) return { skipped: true, reason: 'account disabled' };
  if (account.sync_orders_enabled === false) return { skipped: true, reason: 'order sync disabled' };
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

// ── price adjustment ─────────────────────────────────────────────────────────

// Resolve a product's price adjustment as { pct, fixed } (either may be negative
// to lower or positive to raise). Precedence:
//   1. the listing's per-product % override (operator set one for this product)
//   2. the highest-priority active category rule the product matches — carries
//      BOTH a % and a fixed amount (e.g. +5% +Rs.50 to cover that platform's
//      shipping on a category)
//   3. the account default %
function effectiveAdjustment(product, listing, account, rules) {
  // Matching category rule (highest priority among the product's categories).
  const catIds = new Set((product.categories || []).map((c) => c && c.documentId).filter(Boolean));
  let rule = null;
  for (const r of rules || []) {
    const cat = r.category && r.category.documentId;
    if (!cat || !catIds.has(cat)) continue;
    if (!rule || (Number(r.priority) || 0) > (Number(rule.priority) || 0)) rule = r;
  }
  // % precedence: per-listing override → category rule → account default.
  const lp = listing && listing.price_adjust_pct;
  let pct;
  if (lp !== null && lp !== undefined && lp !== '') pct = Number(lp) || 0;
  else if (rule) pct = Number(rule.adjust_pct) || 0;
  else {
    const ap = account && account.price_adjust_pct;
    pct = (ap !== null && ap !== undefined && ap !== '') ? (Number(ap) || 0) : 0;
  }
  // The fixed amount comes only from a category rule (e.g. a shipping surcharge);
  // a per-product % override changes the margin but does NOT drop the category's
  // fixed cost.
  const fixed = rule ? (Number(rule.adjust_fixed) || 0) : 0;
  return { pct, fixed };
}

// adjusted = base × (1 + pct/100) + fixed, floored at 0, rounded to 2dp.
function applyAdjustment(base, adj) {
  const b = Number(base) || 0;
  if (!b) return 0;
  const v = b * (1 + (Number(adj.pct) || 0) / 100) + (Number(adj.fixed) || 0);
  return Math.round(Math.max(0, v) * 100) / 100;
}

// ── catalog push (full product upsert; catalog-capable providers only) ────────

// The publish set is identical for the inventory and catalog syncs: products in
// the account's attached product-groups ∪ individually-selected listings. Shared
// so both derive the same candidate id set + listing lookup.
async function resolvePublishSet(account) {
  const [groupProducts, allListings] = await Promise.all([
    strapi.listAccountGroupProducts(account.documentId),
    strapi.listAllListings(account.documentId),
  ]);
  const listingByProduct = new Map();
  for (const l of allListings) { const pid = l.product?.documentId; if (pid) listingByProduct.set(pid, l); }
  const wantedIds = new Set();
  for (const p of groupProducts) if (p?.documentId) wantedIds.add(p.documentId);
  for (const l of allListings) if (l.selected && l.product?.documentId) wantedIds.add(l.product.documentId);
  return { wantedIds, listingByProduct };
}

function mediaOut(m) {
  if (!m || !m.url) return null;
  return { url: m.url, name: m.name || null, alternativeText: m.alternativeText || null, mime: m.mime || null, width: m.width || null, height: m.height || null, formats: m.formats || null };
}

// name+slug pairs — the target find-or-creates its own category/brand/term rows
// by slug, so Rutba↔Rutba taxonomy needs no operator mapping.
function taxonomyOut(arr) {
  return (arr || []).map((c) => ({ name: c.name || null, slug: c.slug || null })).filter((c) => c.slug || c.name);
}

// One catalog product payload. Prices are already adjusted by the caller (adj);
// identity travels as origin_document_id (the in-house documentId).
function buildCatalogProduct(p, adj) {
  const sellingBase = Number(p.selling_price) || 0;
  const offerBase = Number(p.offer_price) > 0 ? Number(p.offer_price) : null;
  return {
    origin_document_id: p.documentId,
    sku: p.sku || null,
    barcode: p.barcode || null,
    name: p.name || null,
    slug: p.slug || null,
    summary: p.summary || null,
    description: p.description || null,
    cost_price: p.cost_price != null ? Number(p.cost_price) : null,
    selling_price: applyAdjustment(sellingBase, adj),
    offer_price: offerBase != null ? applyAdjustment(offerBase, adj) : null,
    tax_rate: p.tax_rate != null ? Number(p.tax_rate) : null,
    stock_quantity: Number(p.stock_quantity) || 0,
    is_active: p.is_active !== false,
    unit_of_measure: p.unit_of_measure || null,
    kind: p.kind || null,
    keywords: p.keywords || null,
    categories: taxonomyOut(p.categories),
    brands: taxonomyOut(p.brands),
    terms: taxonomyOut(p.terms),
    media: { logo: mediaOut(p.logo), gallery: (p.gallery || []).map(mediaOut).filter(Boolean) },
  };
}

// Pure assembly of the catalog push payload from already-fetched data. Kept
// separate from the I/O so the parent-resolution + variant nesting + price
// adjustment is unit-testable without Strapi. Returns { payload, metaByOrigin,
// skipped }.
function assembleCatalogPayload({ parents, variantsByParent, listingByProduct, account, rules }) {
  const payload = [];
  const metaByOrigin = new Map();
  let skipped = 0;
  for (const product of parents || []) {
    // A "parent" itself flagged is_variant is a data anomaly (a variant whose
    // own parent wasn't published) — skip rather than push a malformed row.
    if (product.is_variant === true) { skipped += 1; continue; }
    if (product.is_active === false || !product.sku) { skipped += 1; continue; }
    const listing = (listingByProduct && listingByProduct.get(product.documentId)) || null;
    const adj = effectiveAdjustment(product, listing, account, rules);
    const entry = buildCatalogProduct(product, adj);

    // Nested variants with a positive-or-parent price fallback (variants often
    // carry null/0 prices — see the variant-price fallback convention).
    const parentSelling = Number(product.selling_price) || 0;
    const parentOffer = Number(product.offer_price) > 0 ? Number(product.offer_price) : null;
    entry.variants = ((variantsByParent && variantsByParent.get(product.documentId)) || [])
      .filter((v) => v && v.sku && v.is_active !== false)
      .map((v) => {
        const ve = buildCatalogProduct(v, adj);
        const vSellingBase = Number(v.selling_price) > 0 ? Number(v.selling_price) : parentSelling;
        const vOfferBase = Number(v.offer_price) > 0 ? Number(v.offer_price) : parentOffer;
        ve.selling_price = applyAdjustment(vSellingBase, adj);
        ve.offer_price = vOfferBase != null ? applyAdjustment(vOfferBase, adj) : null;
        delete ve.variants;
        return ve;
      });

    payload.push(entry);
    metaByOrigin.set(product.documentId, { product, listing });
  }
  return { payload, metaByOrigin, skipped };
}

// Group PUBLISHED variant rows by their parent documentId.
function groupVariantsByParent(variantRows) {
  const variantsByParent = new Map();
  for (const v of variantRows || []) {
    const pid = v.parent && v.parent.documentId;
    if (!pid) continue;
    if (!variantsByParent.has(pid)) variantsByParent.set(pid, []);
    variantsByParent.get(pid).push(v);
  }
  return variantsByParent;
}

// The parent documentId to push for a given selected item: a variant resolves to
// its parent (so it's never orphaned on the target); anything else maps to itself.
function parentDocIdOf(p) {
  return (p.is_variant === true && p.parent && p.parent.documentId) ? p.parent.documentId : p.documentId;
}

// Push the publish set as full products (create/update, incl. variants + media)
// to a catalog-capable target. pushInventory keeps price+stock fresh afterwards;
// this establishes the product on the target in the first place.
async function syncCatalogForAccount(accountDocumentId) {
  let account = await strapi.getAccountSecrets(accountDocumentId);
  if (!account) throw new Error('Account not found');
  if (!account.is_active) return { skipped: true, reason: 'account disabled' };
  account = await ensureFreshToken(account);
  const adapter = providers.getAdapter(account.platform);
  if (!adapter.capabilities?.catalog || typeof adapter.pushCatalog !== 'function') {
    return { skipped: true, reason: 'catalog push not supported' };
  }

  const log = await strapi.createSyncLog({
    marketplace_account: account.documentId, platform: account.platform,
    kind: 'catalog', status: 'running', started_at: new Date().toISOString(),
  });
  const counts = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
  const detail = [];
  try {
    const { wantedIds, listingByProduct } = await resolvePublishSet(account);
    const [selected, rules] = await Promise.all([
      strapi.getCatalogProducts([...wantedIds]),
      strapi.listPriceRules(account.documentId),
    ]);

    // Resolve every selected item to the PARENT product to push (a selected
    // variant pulls in its parent so it's never orphaned on the target).
    const parentDocIds = new Set();
    for (const p of selected) { const pid = parentDocIdOf(p); if (pid) parentDocIds.add(pid); }

    // Fetch the parents fresh (some are only reachable via a selected variant) +
    // all their PUBLISHED variants, then assemble the payload.
    const [parents, variantRows] = await Promise.all([
      strapi.getCatalogProducts([...parentDocIds]),
      strapi.getPublishedVariants([...parentDocIds]),
    ]);
    const { payload, metaByOrigin, skipped } = assembleCatalogPayload({
      parents,
      variantsByParent: groupVariantsByParent(variantRows),
      listingByProduct,
      account,
      rules,
    });
    counts.skipped += skipped;
    counts.fetched = payload.length;

    if (payload.length) {
      const { results } = await adapter.pushCatalog({ account, products: payload });
      for (const r of results || []) {
        const meta = metaByOrigin.get(r.origin_document_id);
        if (r.ok) {
          counts[r.action === 'created' ? 'created' : 'updated'] += 1;
          if (meta) await stampListing(account, meta, { status: 'listed', external_listing_id: r.external_id || null, external_sku_id: r.sku || null, push_error: null });
        } else {
          counts.failed += 1;
          detail.push({ sku: r.sku, origin: r.origin_document_id, error: r.error });
          if (meta) await stampListing(account, meta, { status: 'error', push_error: String(r.error || '').slice(0, 500) });
        }
      }
    }

    await strapi.updateAccount(account.documentId, { last_inventory_synced_at: new Date().toISOString() });
    const status = counts.failed > 0 ? ((counts.created + counts.updated) > 0 ? 'partial' : 'error') : 'success';
    await strapi.updateSyncLog(log.documentId, { status, ...counts, detail, finished_at: new Date().toISOString() });
    return { ...counts, status };
  } catch (e) {
    await strapi.updateSyncLog(log.documentId, { status: 'error', ...counts, error: msg(e).slice(0, 2000), detail, finished_at: new Date().toISOString() });
    throw e;
  }
}

// ── listings: push the publish set's adjusted price + stock ──────────────────

// Stamp a listing's push state — update its row, or create one for a
// group-sourced product that has no listing row yet (so its status is tracked).
async function stampListing(account, meta, patch) {
  const data = { last_pushed_at: new Date().toISOString(), ...patch };
  try {
    let listingDocId = meta.listing && meta.listing.documentId;
    if (!listingDocId) {
      // Re-query before creating — the manual push (app) and the cron (worker)
      // run in different processes, so the run-start listing map can be stale;
      // this avoids creating a duplicate row for a group-sourced product.
      const existing = await strapi.findListing(account.documentId, meta.product.documentId);
      listingDocId = existing && existing.documentId;
    }
    if (listingDocId) {
      await strapi.updateListing(listingDocId, data);
    } else {
      await strapi.createListing({
        marketplace_account: account.documentId,
        platform: account.platform,
        product: { documentId: meta.product.documentId },
        product_sku: meta.product.sku || null,
        product_name: meta.product.name || null,
        selected: false, // published via a product-group, not individually picked
        ...data,
      });
    }
  } catch (e) {
    console.warn(`[marketplace] stampListing failed: ${msg(e)}`);
  }
}

// The publish set = products in the account's attached product-groups ∪
// individually-selected listings, fetched fresh as PUBLISHED-only (a direct
// /products find excludes drafts, unlike a nested relation populate, so a draft
// product never reaches the marketplace) + active. Each is pushed with the
// per-marketplace price adjustment; the SalePrice comes from a live marketplace
// offer when one applies (else the product's own offer_price). Used by both the
// manual "Push" button and the inventory cron.
async function syncInventoryForAccount(accountDocumentId) {
  let account = await strapi.getAccountSecrets(accountDocumentId);
  if (!account) throw new Error('Account not found');
  if (!account.is_active) return { skipped: true, reason: 'account disabled' };
  if (account.sync_inventory_enabled === false) return { skipped: true, reason: 'inventory sync disabled' };
  account = await ensureFreshToken(account);
  const adapter = providers.getAdapter(account.platform);
  if (!adapter.capabilities?.inventory) return { skipped: true, reason: 'price/stock push not supported' };

  const log = await strapi.createSyncLog({
    marketplace_account: account.documentId, platform: account.platform,
    kind: 'inventory', status: 'running', started_at: new Date().toISOString(),
  });
  const counts = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
  const detail = [];
  try {
    const [groupProducts, allListings] = await Promise.all([
      strapi.listAccountGroupProducts(account.documentId),
      strapi.listAllListings(account.documentId),
    ]);
    const listingByProduct = new Map();
    for (const l of allListings) { const pid = l.product?.documentId; if (pid) listingByProduct.set(pid, l); }

    // Candidate product ids: every group product ∪ each individually-selected listing.
    const wantedIds = new Set();
    for (const p of groupProducts) if (p?.documentId) wantedIds.add(p.documentId);
    for (const l of allListings) if (l.selected && l.product?.documentId) wantedIds.add(l.product.documentId);

    // Authoritative PUBLISHED product data — the publish gate. Drafts are absent
    // here, so they never get pushed; is_active + sku are re-checked.
    const products = await strapi.getPublishedProducts([...wantedIds]);
    const entries = [];
    for (const product of products) {
      if (product.is_active === false || !product.sku) continue;
      entries.push({ product, listing: listingByProduct.get(product.documentId) || null });
    }
    counts.fetched = entries.length;

    // Marketplace SalePrice from live offers + the account's category price rules.
    const [offerPrices, rules] = await Promise.all([
      strapi.fetchOfferPrices(account.documentId, entries.map((e) => e.product.documentId)),
      strapi.listPriceRules(account.documentId),
    ]);

    const updates = [];
    const bySku = new Map(); // sku → { product, listing, price }
    for (const { product, listing } of entries) {
      const sku = product.sku || listing?.product_sku;
      if (!sku) { counts.skipped += 1; continue; }
      const adj = effectiveAdjustment(product, listing, account, rules);
      const price = applyAdjustment(product.selling_price, adj);
      // A non-positive regular price would be silently dropped from the XML
      // (quantity-only) and is invalid on Daraz — skip it with a clear reason.
      if (!(price > 0)) {
        counts.skipped += 1;
        detail.push({ sku, error: `computed price ${price} is not > 0 — check this product's adjustment/fixed rule` });
        continue;
      }
      const offer = offerPrices[product.documentId];
      const offerBase = offer && Number.isFinite(Number(offer.finalPrice))
        ? Number(offer.finalPrice)
        : (Number(product.offer_price) > 0 ? Number(product.offer_price) : null);
      let salePrice = offerBase != null ? applyAdjustment(offerBase, adj) : undefined;
      // Daraz requires SalePrice < Price; drop it if the adjustment collapsed the gap.
      if (salePrice != null && !(salePrice < price)) salePrice = undefined;
      const quantity = Number(product.stock_quantity) || 0;
      updates.push({ sku, quantity, price, salePrice });
      bySku.set(String(sku), { product, listing, price });
    }

    for (let i = 0; i < updates.length; i += INVENTORY_BATCH) {
      const batch = updates.slice(i, i + INVENTORY_BATCH);
      const { results } = await adapter.pushInventory({ account, updates: batch });
      for (const r of results || []) {
        const meta = bySku.get(String(r.sku));
        if (r.ok) {
          counts.updated += 1;
          if (meta) await stampListing(account, meta, { status: 'listed', listed_price: meta.price, push_error: null });
        } else {
          counts.failed += 1;
          detail.push({ sku: r.sku, error: r.error });
          if (meta) await stampListing(account, meta, { status: 'error', push_error: String(r.error || '').slice(0, 500) });
        }
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

async function syncAllCatalog() {
  const accounts = await strapi.listAccounts({ is_active: { $eq: true }, sync_inventory_enabled: { $eq: true } });
  let pushed = 0;
  let considered = 0;
  for (const a of accounts) {
    // Only catalog-capable platforms (Rutba targets); Daraz etc. skip this job.
    if (!providers.hasAdapter(a.platform)) continue;
    const adapter = providers.getAdapter(a.platform);
    if (!adapter.capabilities?.catalog || typeof adapter.pushCatalog !== 'function') continue;
    considered += 1;
    try { const r = await syncCatalogForAccount(a.documentId); pushed += (r.created || 0) + (r.updated || 0); }
    catch (e) { console.warn(`[marketplace] cron syncCatalog ${a.documentId} failed: ${msg(e)}`); }
  }
  return { accounts: considered, pushed };
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
  setAccountEnabled,
  getCatalogSpec,
  pullTaxonomy,
  syncOrdersForAccount,
  syncInventoryForAccount,
  syncCatalogForAccount,
  syncAllOrders,
  syncAllInventory,
  syncAllCatalog,
  refreshExpiringTokens,
  // pure helpers exported for unit tests
  effectiveAdjustment,
  applyAdjustment,
  _msg: msg,
  __test: {
    assembleCatalogPayload,
    groupVariantsByParent,
    parentDocIdOf,
    buildCatalogProduct,
    mediaOut,
    taxonomyOut,
  },
};
