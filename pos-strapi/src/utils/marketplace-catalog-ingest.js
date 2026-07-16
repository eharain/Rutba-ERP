'use strict';

// Receiving side of the Rutba↔Rutba catalog integration.
//
// The in-house instance's marketplace worker (rutba-marketplace, `rutba`
// provider) POSTs a batch of already-price-adjusted products here; this upserts
// them into THIS instance (the online store). It runs on whichever instance is
// the target — same codebase, dormant on the source.
//
// Identity is the ORIGIN documentId (the in-house product's documentId), stored
// in the target product's `external_ids.rutba_origin`. The barcode is NOT an
// identity key: SKUs are assumed unique + stable, so we match on SKU; if an
// incoming barcode collides with a *different* product we index-suffix it
// (`code-2`, `code-3`, …) rather than overwrite — see uniqueBarcode.

const PRODUCT_UID = 'api::product.product';
const CATEGORY_UID = 'api::category.category';
const BRAND_UID = 'api::brand.brand';
const FILE_UID = 'plugin::upload.file';

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Find-or-create a category/brand by slug, returning its documentId. Both use
// draft & publish, so a freshly created one is published to be storefront-live.
// Cached per batch so repeated categories don't re-query.
async function resolveTaxonomy(strapi, uid, arr, cache) {
  const ids = [];
  for (const t of arr || []) {
    const slug = t.slug || slugify(t.name);
    if (!slug) continue;
    if (cache.has(slug)) { ids.push(cache.get(slug)); continue; }
    let docId;
    const existing = await strapi.db.query(uid).findOne({ where: { slug }, select: ['id', 'documentId'] });
    if (existing) {
      docId = existing.documentId;
    } else {
      const created = await strapi.documents(uid).create({ data: { name: t.name || slug, slug } });
      try { await strapi.documents(uid).publish({ documentId: created.documentId }); } catch (_) { /* stays draft */ }
      docId = created.documentId;
    }
    cache.set(slug, docId);
    ids.push(docId);
  }
  return ids;
}

// Register a media file by REFERENCE — no binary upload. The image already lives
// on the shared media host (images.rutba.pk), reachable by both instances, so we
// only need an upload.file row pointing at the same URL. Idempotent on URL.
async function resolveMediaId(strapi, media) {
  if (!media || !media.url) return null;
  const url = String(media.url);
  const existing = await strapi.db.query(FILE_UID).findOne({ where: { url }, select: ['id'] });
  if (existing) return existing.id;

  const clean = url.split('?')[0];
  const baseName = clean.substring(clean.lastIndexOf('/') + 1) || 'image';
  const extMatch = baseName.match(/\.[a-z0-9]+$/i);
  const ext = extMatch ? extMatch[0] : '';
  const hash = `rutbasync_${Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`;
  try {
    const created = await strapi.documents(FILE_UID).create({
      data: {
        name: media.name || baseName,
        alternativeText: media.alternativeText || null,
        hash,
        ext,
        mime: media.mime || 'image/jpeg',
        size: media.size || 0,
        url,
        width: media.width || null,
        height: media.height || null,
        formats: media.formats || null,
        provider: media.provider || 'marketplace-sync',
        folderPath: '/',
      },
    });
    return created.id;
  } catch (e) {
    strapi.log.warn(`[marketplace-ingest] media register failed for ${url}: ${e.message}`);
    return null;
  }
}

// Resolve a collision-free barcode. If `desired` is already used by ANY other
// product (documentId ≠ self), suffix an index — the origin instruction: keep
// barcodes unique on collision, provided the documentId differs.
async function uniqueBarcode(strapi, desired, selfDocumentId) {
  if (!desired) return null;
  let candidate = String(desired);
  for (let n = 2; n <= 50; n += 1) {
    const where = { barcode: candidate };
    if (selfDocumentId) where.documentId = { $ne: selfDocumentId };
    const clash = await strapi.db.query(PRODUCT_UID).findOne({ where, select: ['id'] });
    if (!clash) return candidate;
    candidate = `${desired}-${n}`;
  }
  return `${desired}-${Date.now()}`;
}

// Upsert one product (or variant, when parentDocId is set). Returns
// { documentId, action: 'created' | 'updated' }.
async function upsertOne(strapi, p, originAccountId, caches, parentDocId) {
  const [categories, brands] = await Promise.all([
    resolveTaxonomy(strapi, CATEGORY_UID, p.categories, caches.cat),
    resolveTaxonomy(strapi, BRAND_UID, p.brands, caches.brand),
  ]);
  const logoId = await resolveMediaId(strapi, p.media && p.media.logo);
  const galleryIds = [];
  for (const g of (p.media && p.media.gallery) || []) {
    const id = await resolveMediaId(strapi, g);
    if (id) galleryIds.push(id);
  }

  const existing = p.sku
    ? await strapi.db.query(PRODUCT_UID).findOne({ where: { sku: p.sku }, select: ['id', 'documentId', 'external_ids'] })
    : null;
  const selfDocId = existing ? existing.documentId : null;
  const barcode = await uniqueBarcode(strapi, p.barcode, selfDocId);

  const prevExternal = existing && existing.external_ids && typeof existing.external_ids === 'object' ? existing.external_ids : {};
  const external_ids = { ...prevExternal, rutba_origin: p.origin_document_id, rutba_origin_account: originAccountId };

  const data = {
    name: p.name || null,
    sku: p.sku || null,
    barcode,
    summary: p.summary || null,
    description: p.description || null,
    cost_price: p.cost_price != null ? p.cost_price : null,
    offer_price: p.offer_price != null ? p.offer_price : null,
    selling_price: p.selling_price != null ? p.selling_price : null,
    tax_rate: p.tax_rate != null ? p.tax_rate : null,
    stock_quantity: Number.isFinite(Number(p.stock_quantity)) ? Number(p.stock_quantity) : 0,
    is_active: p.is_active !== false,
    external_ids,
    is_variant: !!parentDocId,
    categories,
    brands,
  };
  if (p.unit_of_measure) data.unit_of_measure = p.unit_of_measure;
  if (p.kind) data.kind = p.kind;
  if (p.keywords) data.keywords = p.keywords;
  if (logoId) data.logo = logoId;
  if (galleryIds.length) data.gallery = galleryIds;
  if (parentDocId) data.parent = parentDocId;

  let documentId;
  let action;
  if (existing) {
    await strapi.documents(PRODUCT_UID).update({ documentId: existing.documentId, data });
    documentId = existing.documentId;
    action = 'updated';
  } else {
    // Prefer the origin slug for URL parity; fall back to name-autogen if that
    // slug is already taken on this instance (uid uniqueness).
    try {
      const created = await strapi.documents(PRODUCT_UID).create({ data: { ...data, ...(p.slug ? { slug: p.slug } : {}) } });
      documentId = created.documentId;
    } catch (e) {
      if (p.slug && /slug|unique/i.test(e.message || '')) {
        const created = await strapi.documents(PRODUCT_UID).create({ data });
        documentId = created.documentId;
      } else {
        throw e;
      }
    }
    action = 'created';
  }
  await strapi.documents(PRODUCT_UID).publish({ documentId });
  return { documentId, action };
}

/**
 * Upsert a batch of catalog products. Each parent is independent (one failure
 * doesn't abort the batch); variants ride under their parent and inherit the
 * parent's categories when they carry none of their own.
 * Returns { results: [{ origin_document_id, sku, ok, external_id, action, error }] }.
 */
async function ingestCatalog(strapi, { origin_account_id: originAccountId, products }) {
  const results = [];
  const caches = { cat: new Map(), brand: new Map() };
  for (const p of products || []) {
    try {
      const parent = await upsertOne(strapi, p, originAccountId, caches, null);
      let vOk = 0;
      let vFail = 0;
      for (const v of p.variants || []) {
        try {
          const variant = { ...v, categories: (v.categories && v.categories.length) ? v.categories : p.categories, brands: (v.brands && v.brands.length) ? v.brands : p.brands };
          await upsertOne(strapi, variant, originAccountId, caches, parent.documentId);
          vOk += 1;
        } catch (e) {
          vFail += 1;
          strapi.log.warn(`[marketplace-ingest] variant ${v && v.sku} failed: ${e.message}`);
        }
      }
      results.push({ origin_document_id: p.origin_document_id, sku: p.sku, ok: true, external_id: parent.documentId, action: parent.action, variants: { ok: vOk, failed: vFail } });
    } catch (e) {
      strapi.log.warn(`[marketplace-ingest] product ${p && p.sku} failed: ${e.message}`);
      results.push({ origin_document_id: p && p.origin_document_id, sku: p && p.sku, ok: false, error: e.message });
    }
  }
  return { results };
}

/**
 * Price + stock refresh for products already on this instance. Matches each
 * update by SKU; unknown SKUs are reported (not created — that's ingestCatalog's
 * job). Returns { results: [{ sku, ok, action, error }] }.
 */
async function updateInventory(strapi, updates) {
  const results = [];
  for (const u of updates || []) {
    if (!u || u.sku == null) { results.push({ sku: u && u.sku, ok: false, error: 'missing sku' }); continue; }
    try {
      const existing = await strapi.db.query(PRODUCT_UID).findOne({ where: { sku: String(u.sku) }, select: ['id', 'documentId'] });
      if (!existing) { results.push({ sku: u.sku, ok: false, error: 'unknown sku' }); continue; }
      const data = {};
      if (u.quantity != null) data.stock_quantity = Number(u.quantity) || 0;
      if (u.price != null && Number(u.price) > 0) data.selling_price = Number(u.price);
      if (u.salePrice != null && Number(u.salePrice) > 0) data.offer_price = Number(u.salePrice);
      await strapi.documents(PRODUCT_UID).update({ documentId: existing.documentId, data });
      await strapi.documents(PRODUCT_UID).publish({ documentId: existing.documentId });
      results.push({ sku: u.sku, ok: true, action: 'updated' });
    } catch (e) {
      results.push({ sku: u.sku, ok: false, error: e.message });
    }
  }
  return { results };
}

module.exports = { ingestCatalog, updateInventory, resolveMediaId, uniqueBarcode };
