'use strict';

// Daraz provider adapter (Daraz Open Platform — the Lazada engine), app-side.
//
// Ported from pos-strapi/src/marketplace-providers/daraz.js. Same signing +
// REST surface; the `strapi` handle is gone (config from env via base, logging
// via console). Methods take `{ account, ... }`.

const base = require('./base');

const PLATFORM = 'daraz';

const REGION_HOSTS = {
  pk: 'https://api.daraz.pk/rest',
  bd: 'https://api.daraz.com.bd/rest',
  lk: 'https://api.daraz.lk/rest',
  np: 'https://api.daraz.com.np/rest',
  mm: 'https://api.daraz.com.mm/rest',
};

const REGION_AUTH_HOSTS = {
  pk: 'https://api.daraz.pk/oauth/authorize',
  bd: 'https://api.daraz.com.bd/oauth/authorize',
  lk: 'https://api.daraz.lk/oauth/authorize',
  np: 'https://api.daraz.com.np/oauth/authorize',
  mm: 'https://api.daraz.com.mm/oauth/authorize',
};

function regionOf(account) {
  const cfg = base.getProviderConfig(PLATFORM);
  return String((account && account.region) || cfg.region || 'pk').toLowerCase();
}

function restHost(account) {
  const cfg = base.getProviderConfig(PLATFORM);
  if (cfg.apiHost) return String(cfg.apiHost).replace(/\/+$/, '');
  return REGION_HOSTS[regionOf(account)] || REGION_HOSTS.pk;
}

function authHost(account) {
  const cfg = base.getProviderConfig(PLATFORM);
  if (cfg.authUrl) return cfg.authUrl;
  return REGION_AUTH_HOSTS[regionOf(account)] || REGION_AUTH_HOSTS.pk;
}

/** OAuth client credentials: account-level overrides win over app config. */
function clientCreds(account) {
  const cfg = base.getProviderConfig(PLATFORM);
  const appKey = (account && account.api_key) || cfg.appKey;
  const appSecret = (account && account.api_secret) || cfg.appSecret;
  return { appKey, appSecret };
}

function accessTokenFor(account) {
  const token = account && account.access_token;
  if (!token) {
    throw new base.ProviderError('Daraz account is not connected (missing access token)', { platform: PLATFORM });
  }
  return token;
}

/** sign = HMAC-SHA256( apiPath + Σ(sortedKey + value) , appSecret ) → hex, UPPER */
function sign(apiPath, params, appSecret) {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== undefined && params[k] !== null)
    .sort();
  const concatenated = apiPath + keys.map((k) => `${k}${params[k]}`).join('');
  return base.hmacSha256(appSecret, concatenated, 'hex').toUpperCase();
}

async function callApi({ account, apiPath, business = {}, method = 'GET', needsToken = true }) {
  const { appKey, appSecret } = clientCreds(account);
  if (!appKey || !appSecret) {
    throw new base.ProviderError('Daraz app credentials are not configured (app_key/app_secret)', { platform: PLATFORM });
  }

  const sys = {
    app_key: appKey,
    sign_method: 'sha256',
    timestamp: String(Date.now()),
  };
  if (needsToken) sys.access_token = accessTokenFor(account);

  const biz = {};
  for (const [k, v] of Object.entries(business)) {
    if (v !== undefined && v !== null && v !== '') biz[k] = v;
  }

  const all = { ...sys, ...biz };
  all.sign = sign(apiPath, all, appSecret);

  const url = `${restHost(account)}${apiPath}`;
  const data = method === 'POST'
    ? await base.httpRequest(url, { method: 'POST', platform: PLATFORM, form: all })
    : await base.httpRequest(url, { method: 'GET', platform: PLATFORM, query: all });

  if (data && typeof data === 'object' && data.code !== undefined && String(data.code) !== '0') {
    throw new base.ProviderError(data.message || `Daraz API error ${data.code}`, {
      platform: PLATFORM,
      code: data.code,
      raw: data,
    });
  }
  // Unwrap the Lazada/Daraz envelope: the business payload lives under `.data`
  // ({ code, data, request_id }). Token endpoints return their fields at the top
  // level (no `.data`), so only unwrap when `.data` is present.
  if (data && typeof data === 'object' && data.data !== undefined) return data.data;
  return data;
}

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeShipping(a) {
  if (!a || typeof a !== 'object') return {};
  const name = [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || undefined;
  return {
    name,
    phone: a.phone || a.phone2 || undefined,
    line1: a.address1 || undefined,
    line2: [a.address2, a.address3, a.address4, a.address5].filter(Boolean).join(', ') || undefined,
    city: a.city || undefined,
    state: a.region || undefined,
    country: a.country || undefined,
    zip_code: a.post_code || undefined,
  };
}

function pickStatus(statuses) {
  if (Array.isArray(statuses) && statuses.length) return String(statuses[0]);
  return undefined;
}

// ── pure transforms (extracted so they're unit-testable; see __test export) ──

function normalizeOrder(o) {
  return {
    externalOrderId: String(o.order_id),
    externalOrderNumber: o.order_number ? String(o.order_number) : undefined,
    placedAt: o.created_at ? new Date(o.created_at).toISOString() : undefined,
    status: pickStatus(o.statuses),
    paymentMethod: o.payment_method || undefined,
    paid: !/cash|cod/i.test(String(o.payment_method || '')),
    currency: o.currency || undefined,
    buyer: {
      name: [o.customer_first_name, o.customer_last_name].filter(Boolean).join(' ').trim() || undefined,
      phone: (o.address_shipping && (o.address_shipping.phone || o.address_shipping.phone2)) || undefined,
    },
    shipping: normalizeShipping(o.address_shipping),
    totals: {
      itemsTotal: o.price !== undefined ? Number(o.price) : undefined,
      shippingFee: o.shipping_fee !== undefined ? Number(o.shipping_fee) : undefined,
      total: o.price !== undefined ? Number(o.price) : undefined,
    },
    raw: o,
  };
}

function normalizeItem(it) {
  const qty = Number(it.quantity) || 1;
  const unitPrice = it.paid_price !== undefined ? Number(it.paid_price)
    : (it.item_price !== undefined ? Number(it.item_price) : undefined);
  return {
    sku: it.sku || it.shop_sku || it.seller_sku || null,
    name: it.name || it.product_name || undefined,
    quantity: qty,
    unitPrice,
    total: it.paid_price !== undefined ? Number(it.paid_price) * qty : undefined,
    variant: it.variation || undefined,
    raw: it,
  };
}

function flattenCategoryTree(roots) {
  const out = [];
  const walk = (nodes, parentId) => {
    for (const n of nodes || []) {
      const id = n.category_id ?? n.id;
      if (id == null) continue;
      out.push({ external_id: String(id), name: n.name, parent_id: parentId != null ? String(parentId) : null, leaf: !!n.leaf });
      if (Array.isArray(n.children) && n.children.length) walk(n.children, id);
    }
  };
  walk(Array.isArray(roots) ? roots : [], null);
  return out;
}

function buildPriceQuantityXml(rows) {
  const skuXml = (rows || [])
    .filter((u) => u && u.sku != null)
    .map((u) => {
      const qty = Math.max(0, Math.trunc(Number(u.quantity) || 0));
      let inner = `<SellerSku>${xmlEscape(u.sku)}</SellerSku><Quantity>${qty}</Quantity>`;
      if (Number.isFinite(Number(u.price)) && Number(u.price) > 0) inner += `<Price>${Number(u.price).toFixed(2)}</Price>`;
      if (Number.isFinite(Number(u.salePrice)) && Number(u.salePrice) > 0) inner += `<SalePrice>${Number(u.salePrice).toFixed(2)}</SalePrice>`;
      return `<Sku>${inner}</Sku>`;
    })
    .join('');
  return `<Request><Product><Skus>${skuXml}</Skus></Product></Request>`;
}

module.exports = {
  key: PLATFORM,
  label: 'Daraz',
  capabilities: { oauth: true, orders: true, inventory: true, fulfillment: false, catalog: true },

  // Declarative description of how Daraz categorises products, so the mapping UI
  // renders Daraz-specific dimensions without hardcoding. Other providers
  // declare their own (Amazon = browse-nodes + product-types; Shopify = flat
  // collections/types) and the same UI adapts.
  catalogSpec: {
    label: 'Daraz',
    dimensions: [
      {
        key: 'category',
        label: 'Categories',
        internalKind: 'category',          // our marketplace-mapping.kind + entities kind
        internalLabel: 'Category',
        taxonomyKind: 'category',           // engine.pullTaxonomy kind
        external: { type: 'tree', leafOnly: true, hasAttributes: true },
        help: 'Map each of your categories to a Daraz leaf category. Only leaf categories accept listings, and each carries its own required attributes.',
      },
      {
        key: 'brand',
        label: 'Brands',
        internalKind: 'brand',
        internalLabel: 'Brand',
        taxonomyKind: 'brand',
        paged: true,
        external: { type: 'list' },
        help: 'Daraz requires a registered brand id per product. Map your brands to Daraz brands (use "No Brand" where applicable).',
      },
      {
        key: 'term_type',
        label: 'Attributes',
        internalKind: 'term_type',
        internalLabel: 'Term Type',
        external: { type: 'attributes', perCategory: true },
        help: 'Daraz attributes are defined per leaf category. Map your term-types to Daraz attribute names; values resolve from your terms at listing time.',
      },
    ],
  },

  getAuthUrl({ account, state }) {
    const { appKey } = clientCreds(account);
    if (!appKey) throw new base.ProviderError('Daraz OAuth is not configured (missing app_key)', { platform: PLATFORM });
    const u = new URL(authHost(account));
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('force_auth', 'true');
    u.searchParams.set('redirect_uri', base.redirectUri());
    u.searchParams.set('client_id', String(appKey));
    if (state) u.searchParams.set('state', String(state));
    return u.toString();
  },

  async exchangeCode({ account, code }) {
    if (!code) throw new base.ProviderError('Missing OAuth code for Daraz', { platform: PLATFORM });
    const data = await callApi({ account, apiPath: '/auth/token/create', business: { code }, method: 'POST', needsToken: false });
    if (!data || !data.access_token) {
      throw new base.ProviderError('Daraz did not return an access token', { platform: PLATFORM, raw: data });
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      token_expires_at: base.expiryFromTtl(data.expires_in),
      refresh_expires_at: base.expiryFromTtl(data.refresh_expires_in),
      account_name: (account && account.account_name) || data.account || null,
      seller_id: data.seller_id || data.account_id || (account && account.seller_id) || null,
      extra_config: {
        country_user_info: data.country_user_info || null,
        connected_account: data.account || null,
      },
    };
  },

  async refreshToken({ account }) {
    // No expiry guard here: the automatic path (ensureFreshToken) decides
    // WHETHER to refresh; the manual "force refresh" path must always perform it.
    if (!account || !account.refresh_token) return null;
    const data = await callApi({ account, apiPath: '/auth/token/refresh', business: { refresh_token: account.refresh_token }, method: 'POST', needsToken: false });
    if (!data || !data.access_token) return null;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || account.refresh_token,
      token_expires_at: base.expiryFromTtl(data.expires_in),
      refresh_expires_at: data.refresh_expires_in
        ? base.expiryFromTtl(data.refresh_expires_in)
        : account.refresh_expires_at || null,
    };
  },

  async fetchOrders({ account, since, limit = 100 }) {
    // Paginate the full changed-since window (offset walks the updated_at-ASC
    // result set). A single call would silently drop everything past the first
    // page while the caller still advances its watermark — permanent loss. The
    // page cap guards against an unbounded loop; a hit is logged so the gap is
    // visible (next run resumes from the watermark).
    const pageLimit = Math.min(Number(limit) || 100, 100);
    const MAX_PAGES = 100;
    const orders = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const business = {
        sort_by: 'updated_at',
        sort_direction: 'ASC',
        offset: page * pageLimit,
        limit: pageLimit,
      };
      if (since) business.update_after = new Date(since).toISOString();
      const data = await callApi({ account, apiPath: '/orders/get', business });
      const rows = (data && Array.isArray(data.orders) && data.orders) || [];
      orders.push(...rows);
      if (rows.length < pageLimit) break;
      if (page === MAX_PAGES - 1) {
        console.warn(`[daraz] fetchOrders hit the ${MAX_PAGES * pageLimit}-order cap; remaining orders are picked up on the next run`);
      }
    }

    return orders.map(normalizeOrder);
  },

  async fetchOrderItems({ account, externalOrderId }) {
    const data = await callApi({ account, apiPath: '/order/items/get', business: { order_id: externalOrderId } });
    const items = (Array.isArray(data) && data) || (data && Array.isArray(data.order_items) && data.order_items) || [];
    return items.map(normalizeItem);
  },

  async pushInventory({ account, updates }) {
    const rows = (updates || []).filter((u) => u && u.sku != null);
    if (!rows.length) return { results: [] };

    // SellerSku + Quantity, plus Price/SalePrice when supplied (the operator's
    // per-marketplace price adjustment is already applied by the caller).
    const payload = buildPriceQuantityXml(rows);

    let data;
    try {
      data = await callApi({ account, apiPath: '/product/price_quantity/update', business: { payload }, method: 'POST' });
    } catch (e) {
      return { results: rows.map((u) => ({ sku: u.sku, ok: false, error: e.message })) };
    }

    const failures = new Map();
    const errs = (data && Array.isArray(data.errors) && data.errors) || [];
    for (const e of errs) {
      const key = e.seller_sku || e.sku || e.sku_id;
      if (key != null) failures.set(String(key), e.message || `error ${e.code || ''}`.trim());
    }
    return {
      results: rows.map((u) => {
        const err = failures.get(String(u.sku));
        return err ? { sku: u.sku, ok: false, error: err } : { sku: u.sku, ok: true };
      }),
      raw: data,
    };
  },

  // ── catalog taxonomy (feeds the category/brand mapping layer) ──

  /** Flattened marketplace category tree: [{ external_id, name, parent_id, leaf }]. */
  async fetchCategoryTree({ account }) {
    const data = await callApi({ account, apiPath: '/category/tree/get' });
    const roots = Array.isArray(data) ? data : (Array.isArray(data?.categories) ? data.categories : []);
    return flattenCategoryTree(roots);
  },

  /** Required/optional attributes for a leaf category — drives listing validation later. */
  async fetchCategoryAttributes({ account, categoryId }) {
    if (!categoryId) throw new base.ProviderError('categoryId is required for fetchCategoryAttributes', { platform: PLATFORM });
    const data = await callApi({ account, apiPath: '/category/attributes/get', business: { primary_category_id: categoryId } });
    const attrs = Array.isArray(data) ? data : (Array.isArray(data?.attributes) ? data.attributes : []);
    return attrs.map((a) => ({
      name: a.name,
      label: a.label || a.name,
      required: !!(a.is_mandatory || a.required),
      type: a.attribute_type || a.input_type || 'text',
      options: Array.isArray(a.options) ? a.options.map((o) => (o && (o.name ?? o.value ?? o))).filter(Boolean) : [],
      raw: a,
    }));
  },

  /** Marketplace brand list (paged): [{ external_id, name }]. */
  async fetchBrands({ account, offset = 0, limit = 100 }) {
    const data = await callApi({ account, apiPath: '/category/brands/query', business: { offset, limit } });
    const rows = (Array.isArray(data?.modules) && data.modules)
      || (Array.isArray(data?.brands) && data.brands)
      || (Array.isArray(data) ? data : []);
    return rows.map((b) => ({ external_id: String(b.brand_id ?? b.id), name: b.name, raw: b }));
  },

  // Internals exposed for unit tests only (not part of the adapter contract).
  __test: { sign, xmlEscape, normalizeShipping, pickStatus, normalizeOrder, normalizeItem, flattenCategoryTree, buildPriceQuantityXml },
};
