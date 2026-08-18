'use strict';

// Marketplace orchestration engine (app-side). The only caller of the provider
// adapters; talks to Strapi via the API-token client (lib/strapi.js). Drives:
// OAuth connect/refresh, order pulls (→ Strapi ingest endpoint), inventory
// pushes, and the cron loops invoked by the built-in worker (instrumentation.js)
// and the manual-trigger API routes.
//
// Ported from the retired services/strapi orchestration service; strapi.documents()
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

// What the operator has to arrange on the provider's side before an account can
// connect — app category, the APIs to request, setup steps. Static and
// non-sensitive, so it is safe to hand to the browser; the one computed value is
// the OAuth callback URL, which must be whitelisted verbatim and is a frequent
// setup mistake, so we show the resolved value rather than describing it.
function getConnectionSpec(platform) {
  const adapter = providers.getAdapter(platform);
  const spec = adapter.connectionSpec;
  if (!spec) return null;
  // The provider's application form (if it has one) travels with the spec, so
  // the setup page can show BOTH answers the portal asks for — the written
  // description and the uploadable document — without a second round trip.
  const applicationForm = spec.applicationForm
    ? {
      ...spec.applicationForm,
      reason: typeof adapter.renderApplicationReason === 'function'
        ? adapter.renderApplicationReason()
        : null,
    }
    : undefined;
  return {
    ...spec,
    ...(applicationForm ? { applicationForm } : {}),
    platform,
    label: spec.label || adapter.label || platform,
    capabilities: adapter.capabilities || {},
    redirectUri: adapter.capabilities?.oauth ? base.redirectUri() : null,
  };
}

// Render a provider's application/onboarding document from the operator's
// answers (the attachment Daraz asks for when applying for API access). Pure
// string building — no credentials are read and nothing is persisted.
function renderApplicationDoc(platform, values) {
  const adapter = providers.getAdapter(platform);
  if (typeof adapter.renderApplicationDoc !== 'function') {
    throw new Error(`${adapter.label || platform} has no application document`);
  }
  return adapter.renderApplicationDoc({ values: values || {} });
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

  // `attention` is a real marketplace-sync-log column — Strapi silently drops
  // unknown attributes, so a counter without one would vanish from the audit
  // trail with no error (same trap the messages sync notes below).
  const counts = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0, attention: 0 };
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
        // Created, but with line items that matched no product. Counted apart
        // from `failed` — the order is real and was written; it just needs
        // someone to look. Overloading `failed` would make the operator hunt for
        // an error that isn't there.
        if (r.needs_attention) counts.attention += 1;
      }
      detail = results;
    }

    await strapi.updateAccount(account.documentId, { last_orders_synced_at: runStartedAt });
    // A run that created orders with unmatched SKUs is 'partial', not 'success' —
    // otherwise an order where NOTHING matched reads as a clean run in the UI.
    const status = counts.failed > 0
      ? (counts.created + counts.updated > 0 ? 'partial' : 'error')
      : (counts.attention > 0 ? 'partial' : 'success');
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

/**
 * Does this product have a photo to sell with — its own, or one on any of the
 * variants riding under it?
 *
 * "A product with no image does not go out" is enforced in services/strapi by
 * utils/public-product.js. Its set-based helper (imagedProductIdSet) reads the
 * files_related_mph morph table directly and so needs a database handle; this
 * worker runs outside services/strapi and has none. It does not need one: the
 * catalog fetch already populates `logo` and `gallery` for the parent AND for
 * its published variants (see catalogPopulate in lib/strapi.js), so the same
 * rule is applied here to media the API has already handed over.
 *
 * The variant leg is the part that matters. Photography frequently lives only
 * on the colour variants, and a check that looked at the parent alone would
 * quietly stop pushing products that are perfectly sellable. Pinned by tests in
 * test/unit.js.
 */
function productHasImage(product, variants) {
  const has = (p) => !!(p && (p.logo || (Array.isArray(p.gallery) && p.gallery.length > 0)));
  if (has(product)) return true;
  return (variants || []).some(has);
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
  // Every skip is recorded with WHY. A catalog run that quietly drops 40
  // products and then reports a clean success is indistinguishable from one
  // that pushed everything, which is how a broken integration hides.
  const skippedDetail = [];
  const drop = (product, reason) => {
    skipped += 1;
    skippedDetail.push({
      origin_document_id: product && product.documentId,
      sku: (product && product.sku) || null,
      name: (product && product.name) || null,
      reason,
    });
  };

  for (const product of parents || []) {
    // A "parent" itself flagged is_variant is a data anomaly (a variant whose
    // own parent wasn't published) — skip rather than push a malformed row.
    if (product.is_variant === true) { drop(product, 'variant-anomaly'); continue; }
    if (product.is_active === false) { drop(product, 'inactive'); continue; }
    if (!product.sku) { drop(product, 'no-sku'); continue; }

    const productVariants = (variantsByParent && variantsByParent.get(product.documentId)) || [];

    // The image gate, applied at SELECTION: an image-less product never reaches
    // buildCatalogProduct, rather than being pushed with an empty media block.
    // Credits the parent with its variants' photos — see productHasImage.
    if (!productHasImage(product, productVariants)) { drop(product, 'no-image'); continue; }

    const listing = (listingByProduct && listingByProduct.get(product.documentId)) || null;
    const adj = effectiveAdjustment(product, listing, account, rules);
    const entry = buildCatalogProduct(product, adj);

    // Nested variants with a positive-or-parent price fallback (variants often
    // carry null/0 prices — see the variant-price fallback convention).
    const parentSelling = Number(product.selling_price) || 0;
    const parentOffer = Number(product.offer_price) > 0 ? Number(product.offer_price) : null;
    entry.variants = productVariants
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
  return { payload, metaByOrigin, skipped, skippedDetail };
}

/** Counts per skip reason, e.g. { 'no-image': 40, inactive: 3 }. */
function countSkipsByReason(skippedDetail) {
  const out = {};
  for (const s of skippedDetail || []) out[s.reason] = (out[s.reason] || 0) + 1;
  return out;
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
  // `attention` is a real marketplace-sync-log column (see the orders sync):
  // rows that completed but need a human look. An image-less product is exactly
  // that — nothing failed, but a product the operator expected on the
  // marketplace is not there, and only a photo will fix it.
  const counts = { fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0, attention: 0 };
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
    const { payload, metaByOrigin, skipped, skippedDetail } = assembleCatalogPayload({
      parents,
      variantsByParent: groupVariantsByParent(variantRows),
      listingByProduct,
      account,
      rules,
    });
    counts.skipped += skipped;
    counts.fetched = payload.length;

    // Make the skips legible in the audit trail: a per-reason summary, plus the
    // products themselves (capped, so one bad run can't bloat the log row).
    const byReason = countSkipsByReason(skippedDetail);
    if (skippedDetail.length) {
      detail.push({ skipped_by_reason: byReason, skipped_products: skippedDetail.slice(0, 200) });
      const noImage = byReason['no-image'] || 0;
      if (noImage > 0) {
        counts.attention += noImage;
        console.warn(
          `[marketplace] ${account.platform} ${account.documentId}: ${noImage} product(s) not pushed — no image on the product or any of its variants`
        );
      }
    }

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
    // A run that withheld products for want of a photo is 'partial', not
    // 'success' — same rule the orders sync applies to unmatched SKUs. Without
    // this, a catalog sync that pushed 10 of 50 products reads as clean.
    const status = counts.failed > 0
      ? ((counts.created + counts.updated) > 0 ? 'partial' : 'error')
      : (counts.attention > 0 ? 'partial' : 'success');
    await strapi.updateSyncLog(log.documentId, { status, ...counts, detail, finished_at: new Date().toISOString() });
    return { ...counts, status };
  } catch (e) {
    await strapi.updateSyncLog(log.documentId, { status: 'error', ...counts, error: msg(e).slice(0, 2000), detail, finished_at: new Date().toISOString() });
    throw e;
  }
}

// Split the fetched publish set into what gets pushed and what gets pulled down.
// A product is pushable only while it is active and has a SKU. The rest are
// normally just skipped — but one case can't be: a product that was live on the
// marketplace and has since been deactivated. Ignoring it would leave it selling
// there indefinitely, so it becomes a delisting (stock zeroed, listing marked
// delisted). Pure so the split is unit-testable without Strapi.
function partitionInventoryTargets({ products, listingByProduct }) {
  const entries = [];
  const delistings = [];
  let skipped = 0;
  for (const product of products || []) {
    const listing = (listingByProduct && listingByProduct.get(product.documentId)) || null;
    if (product.is_active === false || !product.sku) {
      const sku = product.sku || (listing && listing.product_sku);
      if (sku && listing && listing.status === 'listed') delistings.push({ product, listing, sku });
      else skipped += 1;
      continue;
    }
    entries.push({ product, listing });
  }
  return { entries, delistings, skipped };
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
    // here, so they never get pushed; is_active + sku are re-checked, and
    // anything already live that has since been deactivated becomes a delisting.
    const products = await strapi.getPublishedProducts([...wantedIds]);
    const { entries, delistings, skipped } = partitionInventoryTargets({ products, listingByProduct });
    counts.skipped += skipped;
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

    // Zero the stock of everything that went inactive since its last push so it
    // stops selling. `is_active: false` rides along for targets that understand
    // it (a peer Rutba instance deactivates its own copy); Daraz's price/quantity
    // call reads only sku + quantity from the row and ignores the rest.
    for (let i = 0; i < delistings.length; i += INVENTORY_BATCH) {
      const batch = delistings.slice(i, i + INVENTORY_BATCH);
      const byDelistSku = new Map(batch.map((d) => [String(d.sku), d]));
      const { results } = await adapter.pushInventory({
        account,
        updates: batch.map((d) => ({ sku: d.sku, quantity: 0, is_active: false })),
      });
      for (const r of results || []) {
        const meta = byDelistSku.get(String(r.sku));
        if (r.ok) {
          counts.updated += 1;
          detail.push({ sku: r.sku, action: 'delisted', reason: 'product is not active' });
          if (meta) await stampListing(account, meta, { status: 'delisted', push_error: null });
        } else {
          counts.failed += 1;
          detail.push({ sku: r.sku, action: 'delist', error: r.error });
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

// ── fulfillment: push our processing status back to the marketplace ───────────

/**
 * Tell the marketplace what happened to the orders it gave us.
 *
 * Orders flow marketplace → here, get picked, shipped and delivered here, and
 * the customer keeps watching the marketplace — so without this the storefront
 * shows "confirmed" forever while the parcel is already delivered.
 *
 * Watermark-driven rather than queue-driven: a status change is already
 * recorded on the order, so `updatedAt` IS the queue. A missed run self-heals,
 * because the next one simply scans a wider window.
 */
async function pushOrderStatusForAccount(accountDocumentId) {
  let account = await strapi.getAccountSecrets(accountDocumentId);
  if (!account) throw new Error('Account not found');
  if (!account.is_active) return { skipped: true, reason: 'account disabled' };
  if (account.sync_fulfillment_enabled === false) return { skipped: true, reason: 'fulfillment sync disabled' };
  account = await ensureFreshToken(account);

  const adapter = providers.getAdapter(account.platform);
  if (!adapter.capabilities?.fulfillment || typeof adapter.pushOrderStatus !== 'function') {
    return { skipped: true, reason: 'fulfillment not supported by this platform' };
  }

  const log = await strapi.createSyncLog({
    marketplace_account: account.documentId, platform: account.platform,
    kind: 'fulfillment', status: 'running', started_at: new Date().toISOString(),
  });
  const runStartedAt = new Date().toISOString();
  const counts = { fetched: 0, updated: 0, skipped: 0, failed: 0 };
  let detail = [];

  try {
    const out = await strapi.outboundStatuses(account.documentId, {});
    const updates = Array.isArray(out?.updates) ? out.updates : [];
    counts.fetched = updates.length;

    if (updates.length) {
      const res = await adapter.pushOrderStatus({ account, updates });
      detail = Array.isArray(res?.results) ? res.results : [];
      for (const r of detail) {
        if (r.ok === false) counts.failed += 1;
        else if (r.action === 'unchanged') counts.skipped += 1;
        else counts.updated += 1;
      }
    }

    // Advance the watermark only when nothing failed — a partial failure must
    // stay in the window so the next run retries it rather than losing it.
    if (counts.failed === 0) {
      await strapi.updateAccount(account.documentId, { last_status_pushed_at: runStartedAt });
    }

    const status = counts.failed > 0 ? (counts.updated > 0 ? 'partial' : 'error') : 'success';
    await strapi.updateSyncLog(log.documentId, { status, ...counts, detail, finished_at: new Date().toISOString() });
    return counts;
  } catch (e) {
    await strapi.updateSyncLog(log.documentId, { status: 'error', ...counts, error: msg(e).slice(0, 2000), detail, finished_at: new Date().toISOString() });
    throw e;
  }
}

// ── conversations: two-way order message sync ────────────────────────────────

/**
 * Exchange order conversation messages with the marketplace, both directions.
 *
 * Pull first, then push: a reply written here in response to something pulled
 * in the same run then goes out immediately, instead of waiting a cycle.
 *
 * Loop safety lives in the data, not the timing — a message that arrived from
 * the peer is stamped origin='remote' and is never selected for pushing back.
 */
async function syncOrderMessagesForAccount(accountDocumentId) {
  let account = await strapi.getAccountSecrets(accountDocumentId);
  if (!account) throw new Error('Account not found');
  if (!account.is_active) return { skipped: true, reason: 'account disabled' };
  if (account.sync_messages_enabled === false) return { skipped: true, reason: 'message sync disabled' };
  account = await ensureFreshToken(account);

  const adapter = providers.getAdapter(account.platform);
  if (!adapter.capabilities?.messages) {
    return { skipped: true, reason: 'messages not supported by this platform' };
  }

  const log = await strapi.createSyncLog({
    marketplace_account: account.documentId, platform: account.platform,
    kind: 'messages', status: 'running', started_at: new Date().toISOString(),
  });
  const runStartedAt = new Date().toISOString();
  const since = account.last_messages_synced_at
    ? new Date(account.last_messages_synced_at).toISOString()
    : new Date(Date.now() - FIRST_RUN_LOOKBACK_MS).toISOString();

  // Field names match marketplace-sync-log's columns — Strapi silently drops
  // unknown attributes, so a counter it has no column for would vanish from the
  // audit trail without any error.
  const counts = { fetched: 0, created: 0, updated: 0, pushed: 0, failed: 0 };
  let detail = [];

  try {
    // ── inbound: their side of the thread ──
    if (typeof adapter.fetchOrderMessages === 'function') {
      const remote = await adapter.fetchOrderMessages({ account, since, limit: 200 });
      counts.fetched = remote.length;
      if (remote.length) {
        const res = await strapi.ingestMessages(account.documentId, remote);
        counts.created += res?.created || 0;
        counts.updated += res?.updated || 0;
        counts.failed += res?.failed || 0;
        detail = detail.concat(res?.results || []);
      }
    }

    // ── outbound: our side of the thread ──
    if (typeof adapter.pushOrderMessages === 'function') {
      const out = await strapi.outboundMessages(account.documentId, {});
      const messages = Array.isArray(out?.messages) ? out.messages : [];
      if (messages.length) {
        const res = await adapter.pushOrderMessages({ account, messages });
        counts.pushed = messages.length - (res?.results || []).filter((r) => r.ok === false).length;
        counts.failed += (res?.results || []).filter((r) => r.ok === false).length;
        // Stamp the peer's ids so the next run updates instead of resending.
        if (res?.pairs?.length) await strapi.stampMessages(account.documentId, res.pairs);
        detail = detail.concat(res?.results || []);
      }
    }

    if (counts.failed === 0) {
      await strapi.updateAccount(account.documentId, { last_messages_synced_at: runStartedAt });
    }

    const moved = counts.created + counts.updated + counts.pushed;
    const status = counts.failed > 0 ? (moved > 0 ? 'partial' : 'error') : 'success';
    await strapi.updateSyncLog(log.documentId, { status, ...counts, detail, finished_at: new Date().toISOString() });
    return counts;
  } catch (e) {
    await strapi.updateSyncLog(log.documentId, { status: 'error', ...counts, error: msg(e).slice(0, 2000), detail, finished_at: new Date().toISOString() });
    throw e;
  }
}

// ── cron drivers ───────────────────────────────────────────────────────────────

async function syncAllOrderStatuses() {
  const accounts = await strapi.listAccounts({ is_active: { $eq: true }, sync_fulfillment_enabled: { $eq: true } });
  let updated = 0;
  let considered = 0;
  for (const a of accounts) {
    if (!providers.hasAdapter(a.platform)) continue;
    const adapter = providers.getAdapter(a.platform);
    if (!adapter.capabilities?.fulfillment) continue;
    considered += 1;
    try { const r = await pushOrderStatusForAccount(a.documentId); updated += r.updated || 0; }
    catch (e) { console.warn(`[marketplace] cron pushOrderStatus ${a.documentId} failed: ${msg(e)}`); }
  }
  return { accounts: considered, updated };
}

async function syncAllOrderMessages() {
  const accounts = await strapi.listAccounts({ is_active: { $eq: true }, sync_messages_enabled: { $eq: true } });
  let moved = 0;
  let considered = 0;
  for (const a of accounts) {
    if (!providers.hasAdapter(a.platform)) continue;
    const adapter = providers.getAdapter(a.platform);
    if (!adapter.capabilities?.messages) continue;
    considered += 1;
    try {
      const r = await syncOrderMessagesForAccount(a.documentId);
      moved += (r.created || 0) + (r.pushed || 0);
    } catch (e) { console.warn(`[marketplace] cron syncOrderMessages ${a.documentId} failed: ${msg(e)}`); }
  }
  return { accounts: considered, moved };
}

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
  getConnectionSpec,
  renderApplicationDoc,
  pullTaxonomy,
  syncOrdersForAccount,
  syncInventoryForAccount,
  syncCatalogForAccount,
  pushOrderStatusForAccount,
  syncOrderMessagesForAccount,
  syncAllOrders,
  syncAllInventory,
  syncAllCatalog,
  syncAllOrderStatuses,
  syncAllOrderMessages,
  refreshExpiringTokens,
  // pure helpers exported for unit tests
  effectiveAdjustment,
  applyAdjustment,
  _msg: msg,
  __test: {
    partitionInventoryTargets,
    assembleCatalogPayload,
    groupVariantsByParent,
    parentDocIdOf,
    buildCatalogProduct,
    productHasImage,
    countSkipsByReason,
    mediaOut,
    taxonomyOut,
  },
};
