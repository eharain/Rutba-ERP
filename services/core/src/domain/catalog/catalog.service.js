'use strict';

/**
 * CatalogService — the storage half of ERP Core catalog (portal task E1).
 *
 * `@rutba/shared/core/catalog` holds the rules and no I/O. This file holds the
 * queries and no rules. The split matters most for one method: `priceForUnit`
 * exists because resolving a price needs up to three ROWS — the stock unit, its
 * product, and that product's parent — and every surface that has needed a real
 * price has fetched some subset of them and re-derived the rest inline. Getting
 * the fetch wrong is how a variant silently shows its parent's price, and no
 * amount of care in the pure contract prevents it if the caller never loaded
 * the parent.
 *
 * So: the contract owns "given these levels, what is the price", and this owns
 * "load the levels". Neither can be got right alone.
 *
 * READ-ONLY, like PartyService. Products are created by apps/inventory/stock,
 * stock units by purchasing and manufacturing; a write path here would be a
 * second way to make an item, which is what E1 exists to prevent.
 *
 * Packaging note: the contract is ESM and this is CommonJS, so the require()
 * below leans on Node's require(esm) — on by default from 22.12, and this
 * package already demands node >=22. Same mechanism PartyService uses.
 */

const { documents } = require('../../documents');
const {
  toItem,
  toUnit,
  resolvePrice,
  unitPrice,
  isSellable,
} = require('@rutba/shared/core/catalog');

const PRODUCT_UID = 'api::product.product';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';

/**
 * A variant's price may live on its parent, so the parent comes back with it.
 * One populate rather than a second round trip per row: a picker rendering 25
 * variants would otherwise issue 25 follow-up reads to learn 25 prices.
 */
const ITEM_POPULATE = Object.freeze({ parent: true });

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function clampLimit(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * Project a product row, and its parent if one came back populated.
 *
 * A parent that arrived as a bare id rather than a populated object yields
 * null — and that is reported rather than papered over, because a null parent
 * on a variant means the price resolution below is missing a level and may
 * return `unpriced` for something that is priced perfectly well one step up.
 */
function projectItem(row) {
  const item = toItem(row);
  const parent = row.parent && typeof row.parent === 'object' && row.parent.id
    ? toItem(row.parent)
    : null;
  return { item, parent };
}

/** Attach the resolved price to a projected item, in one consistent shape. */
function priced({ item, parent }) {
  const price = resolvePrice({ item, parent });
  return {
    ...item,
    parent: parent || null,
    price,
    sellable: isSellable(item, price),
    /**
     * A variant whose parent was not loaded. Callers listing variants should
     * treat an unresolved price as unknown, not as unpriced — see projectItem.
     */
    priceIncomplete: Boolean(item.isVariant && item.parentId && !parent),
  };
}

/** One item by numeric product id. */
async function getItem(productId) {
  if (productId === null || productId === undefined || productId === '') return null;
  const rows = await documents(PRODUCT_UID).findMany({
    filters: { id: { $eq: productId } },
    populate: ITEM_POPULATE,
    limit: 1,
  });
  return rows.length ? priced(projectItem(rows[0])) : null;
}

/** One item by documentId — what the frontends address products by. */
async function getItemByDocumentId(documentId) {
  if (!documentId) return null;
  const rows = await documents(PRODUCT_UID).findMany({
    filters: { documentId: { $eq: documentId } },
    populate: ITEM_POPULATE,
    limit: 1,
  });
  return rows.length ? priced(projectItem(rows[0])) : null;
}

/**
 * Search the catalog, priced.
 *
 * `activeOnly` defaults true because the overwhelmingly common caller is a
 * picker, and offering a retired product to be sold is a worse default than
 * hiding one an admin was looking for.
 *
 * Variants are included by default: they are what actually gets sold, and a
 * picker that lists only parents makes the user pick twice.
 */
async function search(options = {}) {
  const limit = clampLimit(options.limit);
  const term = typeof options.q === 'string' ? options.q.trim() : '';
  const clauses = [];

  if (term) {
    clauses.push({
      $or: [
        { name: { $containsi: term } },
        { sku: { $containsi: term } },
        { barcode: { $containsi: term } },
      ],
    });
  }
  if (options.activeOnly !== false) clauses.push({ is_active: { $eq: true } });
  if (options.kind) clauses.push({ kind: { $eq: options.kind } });
  if (options.variants === false) clauses.push({ is_variant: { $eq: false } });

  const rows = await documents(PRODUCT_UID).findMany({
    ...(clauses.length ? { filters: { $and: clauses } } : {}),
    populate: ITEM_POPULATE,
    sort: 'name:asc',
    limit,
  });

  const items = rows.map((row) => priced(projectItem(row)));
  return {
    items,
    truncated: rows.length >= limit,
    // Surfaced because it is actionable: these are rows a catalog manager has
    // to price before anything can sell them, and they are invisible otherwise.
    unpriced: items.filter((i) => i.price.unpriced).length,
  };
}

/**
 * The price of ONE stock unit, resolved across all three levels.
 *
 * This is the method the whole package exists for. It loads the unit, its
 * product and — when that product is a variant — the parent, then hands all
 * three to the contract. Divisible items are divided by the unit's own
 * `sellableUnits`, so a roll comes back per metre rather than per roll.
 */
async function priceForUnit(stockItemId) {
  if (stockItemId === null || stockItemId === undefined || stockItemId === '') return null;
  const rows = await documents(STOCK_ITEM_UID).findMany({
    filters: { id: { $eq: stockItemId } },
    // The product arrives populated, and its own parent with it — two levels in
    // one read. A deep populate is cheaper than the follow-up query, and the
    // follow-up is the one people forget.
    populate: { product: { populate: { parent: true } } },
    limit: 1,
  });
  if (!rows.length) return null;

  const row = rows[0];
  const unit = toUnit(row);
  const productRow = row.product && typeof row.product === 'object' ? row.product : null;
  if (!productRow) {
    // An orphaned stock unit. It may still carry its own price, so answer with
    // what there is rather than null — but say the item is missing, because a
    // unit with no product is a data fault somebody needs to see.
    return { unit, item: null, parent: null, price: resolvePrice({ unit }), itemMissing: true };
  }

  const { item, parent } = projectItem(productRow);
  return {
    unit,
    item,
    parent,
    price: unitPrice({ unit, item, parent }),
    itemMissing: false,
    priceIncomplete: Boolean(item.isVariant && item.parentId && !parent),
  };
}

module.exports = {
  PRODUCT_UID,
  STOCK_ITEM_UID,
  MAX_LIMIT,
  getItem,
  getItemByDocumentId,
  search,
  priceForUnit,
};
