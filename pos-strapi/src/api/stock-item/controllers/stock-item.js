'use strict';

/**
 * stock-item controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const {
  formatName,
  cleanForComparing,
  findByName,
  findCandidates,
  normalizeMode,
  computeIndexedBarcodes,
  computeAutoBarcodes,
  previewBarcodes,
} = require('../services/bulk-helpers');

// Allowed sort columns to prevent SQL injection
const ALLOWED_SORT_FIELDS = new Set(['name', 'sku', 'selling_price', 'cost_price', 'status']);

// Row helpers ────────────────────────────────────────────────────────────────
function truthy(v) {
  if (v === true) return true;
  if (typeof v === 'number') return v === 1;
  const s = (v ?? '').toString().trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'x' || s === 'on';
}

function toNum(v) {
  const n = Number(v);
  return v === '' || v == null || Number.isNaN(n) ? null : n;
}

// Slim projection of a product for the resolve preview payload.
function pickProduct(p) {
  return p ? { documentId: p.documentId, name: p.name, sku: p.sku, barcode: p.barcode } : null;
}

function safeSortField(raw) {
  return ALLOWED_SORT_FIELDS.has((raw || '').trim()) ? (raw || '').trim() : 'name';
}

module.exports = createCoreController('api::stock-item.stock-item', ({ strapi }) => ({
  /**
   * GET /stock-items/orphan-groups
   * Returns distinct (name, selling_price) groups for orphan stock items.
   */
  async orphanGroups(ctx) {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.max(1, Number(ctx.query.pageSize) || 25);
    const search = (ctx.query.search || '').trim();
    const statusFilter = (ctx.query.statusFilter || '').trim();
    const skuFilter = (ctx.query.skuFilter || '').trim();
    const sortField = safeSortField(ctx.query.sortField);
    const sortDir = (ctx.query.sortDir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

    const knex = strapi.db.connection;

    // Build the base query: stock items with no product link
    const qb = knex('stock_items')
      .leftJoin('stock_items_product_lnk', 'stock_items.id', 'stock_items_product_lnk.stock_item_id')
      .whereNull('stock_items_product_lnk.product_id')
      .select('stock_items.*');

    if (search) qb.whereRaw('LOWER(stock_items.name) LIKE ?', [`%${search.toLowerCase()}%`]);
    if (statusFilter) qb.where('stock_items.status', statusFilter);
    if (skuFilter === 'has') qb.whereNotNull('stock_items.sku');
    else if (skuFilter === 'none') qb.whereNull('stock_items.sku');

    qb.orderBy(`stock_items.${sortField}`, sortDir);
    if (sortField !== 'name') qb.orderBy('stock_items.name', 'asc');

    const rows = await qb;

    const makeKey = (n, sp) =>
      `${String(n ?? '').toLowerCase()}__${sp == null ? '__null__' : String(sp)}`;

    const map = new Map();
    for (const item of rows) {
      const key = makeKey(item.name, item.selling_price);
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: item.name || '',
          selling_price: item.selling_price ?? null,
          count: 0,
          sample: mapRow(item),
        });
      }
      map.get(key).count += 1;
    }

    const groups = Array.from(map.values());
    const total = groups.length;
    const start = (page - 1) * pageSize;
    const paged = groups.slice(start, start + pageSize);

    ctx.send({
      data: paged,
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize) || 1,
          total,
        },
      },
    });
  },

  /**
   * GET /stock-items/orphan-groups/items
   * Returns all orphan stock items for a specific (name, selling_price) group.
   */
  async orphanGroupItems(ctx) {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.max(1, Number(ctx.query.pageSize) || 10000);
    const name = (ctx.query.name || '').trim();
    const sellingPriceRaw = ctx.query.selling_price;
    const statusFilter = (ctx.query.statusFilter || '').trim();
    const skuFilter = (ctx.query.skuFilter || '').trim();
    const sortField = safeSortField(ctx.query.sortField);
    const sortDir = (ctx.query.sortDir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

    const knex = strapi.db.connection;

    const qb = knex('stock_items')
      .leftJoin('stock_items_product_lnk', 'stock_items.id', 'stock_items_product_lnk.stock_item_id')
      .whereNull('stock_items_product_lnk.product_id')
      .select('stock_items.*');

    if (name) {
      qb.whereRaw('LOWER(stock_items.name) = ?', [name.toLowerCase()]);
    }

    if (sellingPriceRaw === '__null__') {
      qb.whereNull('stock_items.selling_price');
    } else if (sellingPriceRaw != null && sellingPriceRaw !== '') {
      qb.where('stock_items.selling_price', Number(sellingPriceRaw));
    }

    if (statusFilter) qb.where('stock_items.status', statusFilter);
    if (skuFilter === 'has') qb.whereNotNull('stock_items.sku');
    else if (skuFilter === 'none') qb.whereNull('stock_items.sku');

    qb.orderBy(`stock_items.${sortField}`, sortDir);
    if (sortField !== 'name') qb.orderBy('stock_items.name', 'asc');

    const rows = await qb;

    const total = rows.length;
    const start = (page - 1) * pageSize;
    const paged = rows.slice(start, start + pageSize).map(mapRow);

    ctx.send({
      data: paged,
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize) || 1,
          total,
        },
      },
    });
  },

  /**
   * POST /stock-items/bulk-resolve
   * Dry-run for the Stock Items Import screen — NO writes. For each row it resolves
   * the target product (by documentId, exact name, or a shortlist of candidates),
   * computes the intended per-unit barcodes for the row's mode, and flags which of
   * those barcodes already exist so the UI can show update-vs-create counts.
   *
   * Body: { rows: [ { productName?, productDocumentId?, barcode?, sku?, quantity?,
   *                   barcodeMode?, createNewProduct?, newProductName? }, ... ] }
   */
  async resolveBulkStock(ctx) {
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return ctx.badRequest('rows array is required');

    // One cheap read of every product (name/sku/barcode) for in-memory matching.
    const products = await strapi.documents('api::product.product').findMany({
      fields: ['name', 'sku', 'barcode'],
      limit: -1,
    });

    const plans = rows.map((row, index) => {
      const productName = (row.productName || '').toString().trim();
      const quantity = Math.max(1, Number(row.quantity) || 1);
      const mode = normalizeMode(row.barcodeMode, row);
      const productBarcode = (row.barcode ?? row.productBarcode ?? '').toString().trim();
      const sku = (row.sku ?? '').toString().trim();
      const createNewProduct = truthy(row.createNewProduct) || truthy(row.createNew);

      let productMatch = null;
      let candidates = [];
      let matchType = 'none';

      if (createNewProduct) {
        matchType = 'create-new';
      } else if (row.productDocumentId) {
        const p = products.find((x) => x.documentId === row.productDocumentId);
        if (p) { productMatch = pickProduct(p); matchType = 'id'; }
      } else if (productName) {
        const exact = findByName(products, productName);
        if (exact) {
          productMatch = pickProduct(exact);
          matchType = 'name-exact';
        } else {
          candidates = findCandidates(products, productName, 5).map(pickProduct);
          matchType = candidates.length ? 'name-multiple' : 'none';
        }
      }

      const base = productBarcode || sku || (productMatch && (productMatch.barcode || productMatch.sku)) || '';
      const preview = previewBarcodes(mode, base, quantity);

      return {
        index,
        productName,
        quantity,
        mode,
        base,
        matchType,
        productMatch,
        candidates,
        previewBarcodes: preview,
        needsProduct: matchType === 'none',
      };
    });

    // Single query to see which of the deterministic barcodes already exist.
    const allBarcodes = [...new Set(plans.flatMap((p) => p.previewBarcodes))];
    let existingSet = new Set();
    if (allBarcodes.length) {
      const existing = await strapi.documents('api::stock-item.stock-item').findMany({
        filters: { barcode: { $in: allBarcodes } },
        fields: ['barcode'],
        limit: -1,
      });
      existingSet = new Set(existing.map((e) => e.barcode));
    }

    for (const p of plans) {
      p.existingBarcodes = p.previewBarcodes.filter((b) => existingSet.has(b));
      p.existingCount = p.existingBarcodes.length;
      // Manufacturer/EAN mode mints no stock items — the code lands on the product.
      // In auto mode we can't preview exact codes; every unit is a fresh create.
      p.willCreate = p.mode === 'product' ? 0 : (p.mode === 'auto' ? p.quantity : (p.previewBarcodes.length - p.existingCount));
      p.willUpdateIfEnabled = p.mode === 'auto' || p.mode === 'product' ? 0 : p.existingCount;
    }

    // For manufacturer/EAN rows, surface the product's current InStock count so the
    // reviewer sees the stock the code will attach to.
    for (const p of plans) {
      if (p.mode === 'product' && p.productMatch) {
        const items = await strapi.documents('api::stock-item.stock-item').findMany({
          filters: { product: { documentId: p.productMatch.documentId }, status: 'InStock' },
          fields: ['id'],
          limit: -1,
        });
        p.currentInStock = items.length;
      }
    }

    return ctx.send({
      rows: plans,
      summary: {
        total: plans.length,
        needProduct: plans.filter((p) => p.needsProduct).length,
        ambiguous: plans.filter((p) => p.matchType === 'name-multiple').length,
      },
    });
  },

  /**
   * POST /stock-items/bulk-process
   * Commit. Creates/updates stock items in bulk. The entered barcode is treated as
   * the PRODUCT barcode (stored on product.barcode); the entered sku is the shared
   * per-product identifier copied onto every stock_item.sku; each stock_item.barcode
   * is a UNIQUE derived code per the row's mode. product.stock_quantity is never
   * written here — the stock-item lifecycle recomputes it on create/update.
   *
   * Body: { rows: [ { productName?, productDocumentId?, createNewProduct?, newProductName?,
   *                   name?, barcode?, sku?, quantity?, barcodeMode?, updateExisting?,
   *                   costPrice?, sellingPrice?, offerPrice?, sellableUnits? }, ... ] }
   */
  async processBulkStock(ctx) {
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return ctx.badRequest('rows array is required');

    // Product cache for name matching; grows as we create new products this batch.
    const productCache = await strapi.documents('api::product.product').findMany({
      fields: ['name', 'sku', 'barcode'],
      limit: -1,
    });
    const createdByName = new Map(); // dedupe "create new" products within one batch

    const results = [];
    const createdStockItemDocumentIds = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      try {
        const productName = (row.productName || '').toString().trim();
        const quantity = Math.max(1, Number(row.quantity) || 1);
        const mode = normalizeMode(row.barcodeMode, row);
        const updateExisting = truthy(row.updateExisting);
        const productBarcode = (row.barcode ?? row.productBarcode ?? '').toString().trim();
        const sku = (row.sku ?? '').toString().trim();
        const stockItemName = (row.name || row.stockItemName || productName || '').toString().trim();
        const costPrice = toNum(row.costPrice);
        const sellingPrice = toNum(row.sellingPrice);
        const offerPrice = toNum(row.offerPrice);
        const sellableUnits = Number(row.sellableUnits) || 1;
        // Optional per-row expiry (Epic 5 intake). Blank → the stock-item
        // beforeCreate lifecycle still auto-computes it for perishables.
        const expiryDate = (row.expiryDate || row.expiry_date || '').toString().trim() || null;

        // 1) Resolve / create the product.
        let productObj = null;
        if ((truthy(row.createNewProduct) || truthy(row.createNew)) && (row.newProductName || productName)) {
          const newName = (row.newProductName || productName).toString().trim();
          const cacheKey = cleanForComparing(newName);
          if (createdByName.has(cacheKey)) {
            productObj = createdByName.get(cacheKey);
          } else {
            productObj = await strapi.documents('api::product.product').create({
              data: {
                name: formatName(newName),
                keywords: [newName],
                ...(productBarcode ? { barcode: productBarcode } : {}),
                ...(sku ? { sku } : {}),
                ...(costPrice != null ? { cost_price: costPrice } : {}),
                ...(sellingPrice != null ? { selling_price: sellingPrice } : {}),
                ...(offerPrice != null ? { offer_price: offerPrice } : {}),
                is_active: true,
              },
              status: 'published',
            });
            createdByName.set(cacheKey, productObj);
            productCache.push(productObj);
          }
        } else if (row.productDocumentId) {
          productObj =
            productCache.find((p) => p.documentId === row.productDocumentId) ||
            (await strapi.documents('api::product.product').findOne({
              documentId: row.productDocumentId,
              fields: ['name', 'sku', 'barcode'],
            }));
        } else if (productName) {
          productObj = findByName(productCache, productName);
        }

        if (!productObj) {
          throw new Error('No product resolved — provide a product match/documentId or enable "Create new product"');
        }

        // ── Manufacturer / EAN mode ──────────────────────────────────────────
        // The entered barcode is the manufacturer's code (same on every unit), so
        // it's stored on the PRODUCT (scannable at POS) and existing stock items are
        // left untouched — no per-unit codes are minted. Quantity is informational.
        if (mode === 'product') {
          if (!productBarcode) throw new Error('Manufacturer/EAN mode needs a barcode to set on the product');
          const patch = {};
          if (productObj.barcode !== productBarcode) patch.barcode = productBarcode;
          if (sku && productObj.sku !== sku) patch.sku = sku;
          const manu = (row.manufacturerName || '').toString().trim();
          if (manu) {
            const full = await strapi.documents('api::product.product').findOne({
              documentId: productObj.documentId,
              fields: ['keywords'],
            });
            const kw = Array.isArray(full?.keywords) ? full.keywords : [];
            if (!kw.map(String).includes(manu)) patch.keywords = [...kw, manu];
          }
          if (Object.keys(patch).length) {
            productObj = await strapi.documents('api::product.product').update({
              documentId: productObj.documentId,
              data: patch,
            });
            const ci = productCache.findIndex((p) => p.documentId === productObj.documentId);
            if (ci >= 0) productCache[ci] = productObj;
          }
          const inStock = await strapi.documents('api::stock-item.stock-item').findMany({
            filters: { product: { documentId: productObj.documentId }, status: 'InStock' },
            fields: ['id'],
            limit: -1,
          });
          results.push({
            index, ok: true, mode: 'product',
            productDocumentId: productObj.documentId,
            productName: productObj.name,
            created: 0, updated: 0, productBarcode, inStock: inStock.length,
            note: 'manufacturer barcode set on product',
          });
          continue;
        }

        // 1b) Upsert product-level barcode/sku when supplied and changed.
        const prodPatch = {};
        if (productBarcode && productObj.barcode !== productBarcode) prodPatch.barcode = productBarcode;
        if (sku && productObj.sku !== sku) prodPatch.sku = sku;
        if (Object.keys(prodPatch).length) {
          productObj = await strapi.documents('api::product.product').update({
            documentId: productObj.documentId,
            data: prodPatch,
          });
          const ci = productCache.findIndex((p) => p.documentId === productObj.documentId);
          if (ci >= 0) productCache[ci] = productObj;
        }

        // 2) Compute the UNIQUE per-unit barcodes.
        const base = productBarcode || sku || productObj.barcode || productObj.sku || '';
        let unitBarcodes;
        if (mode === 'distinct') {
          const bc = productBarcode || base;
          if (!bc) throw new Error('Distinct mode needs an explicit barcode');
          unitBarcodes = [bc];
        } else if (mode === 'indexed' && base) {
          unitBarcodes = computeIndexedBarcodes(base, quantity);
        } else {
          unitBarcodes = computeAutoBarcodes(quantity, index);
        }

        // 3) Upsert stock items (update-if-exists-and-updateExisting, else create).
        const sharedSku = sku || productObj.sku || undefined;
        let created = 0;
        let updated = 0;
        const createdBarcodes = [];
        const updatedBarcodes = [];
        for (const bc of unitBarcodes) {
          const existing = await strapi.documents('api::stock-item.stock-item').findMany({
            filters: { barcode: { $eq: bc } },
            fields: ['documentId'],
            limit: 1,
          });
          const common = {
            name: stockItemName || productObj.name,
            ...(sharedSku ? { sku: sharedSku } : {}),
            ...(sellingPrice != null ? { selling_price: sellingPrice } : {}),
            ...(costPrice != null ? { cost_price: costPrice } : {}),
            ...(offerPrice != null ? { offer_price: offerPrice } : {}),
            ...(expiryDate ? { expiry_date: expiryDate } : {}),
            product: { connect: [productObj.documentId] },
          };
          if (existing && existing.length) {
            if (!updateExisting) {
              throw new Error(`Barcode "${bc}" already exists — enable "Update existing" to overwrite`);
            }
            await strapi.documents('api::stock-item.stock-item').update({
              documentId: existing[0].documentId,
              data: common,
            });
            updated++;
            updatedBarcodes.push(bc);
          } else {
            const si = await strapi.documents('api::stock-item.stock-item').create({
              data: { ...common, barcode: bc, status: 'InStock', sellable_units: sellableUnits },
            });
            created++;
            createdStockItemDocumentIds.push(si.documentId);
            createdBarcodes.push(bc);
          }
        }

        results.push({
          index, ok: true, mode,
          productDocumentId: productObj.documentId,
          productName: productObj.name,
          sku: sharedSku || null,
          created, updated, createdBarcodes, updatedBarcodes,
        });
      } catch (err) {
        results.push({ index, ok: false, error: err.message });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok).length;
    return ctx.send({
      processed: results.length,
      ok: okCount,
      failed: failCount,
      results,
      createdStockItemDocumentIds,
    });
  },
}));

/**
 * Map a raw DB row (snake_case columns) to the attribute names
 * the frontend expects (matching the Strapi schema).
 */
function mapRow(row) {
  return {
    id: row.id,
    documentId: row.document_id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    status: row.status,
    sellable_units: row.sellable_units,
    sold_units: row.sold_units,
    cost_price: row.cost_price,
    selling_price: row.selling_price,
    offer_price: row.offer_price,
    discount: row.discount,
    archived: row.archived,
    archived_at: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
