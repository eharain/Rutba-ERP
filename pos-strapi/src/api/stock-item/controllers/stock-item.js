'use strict';

/**
 * stock-item controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

// Allowed sort columns to prevent SQL injection
const ALLOWED_SORT_FIELDS = new Set(['name', 'sku', 'selling_price', 'cost_price', 'status']);

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
