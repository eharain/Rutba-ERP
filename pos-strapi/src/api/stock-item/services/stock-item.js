'use strict';

/**
 * stock-item service.
 *
 * Stock model invariant — kept here, deliberately out of the product module:
 *   product.stock_quantity === count(stock-items WHERE product=X AND status='InStock' AND archived != true)
 *
 * stock-item rows are the canonical source of truth for availability.
 * product.stock_quantity is a denormalised cache that the stock-item lifecycle
 * keeps in sync via `recomputeProductStock`. The product content-type knows
 * nothing about this — every read should treat product.stock_quantity as a
 * derived value, and no caller should write it directly.
 */

const { createCoreService } = require('@strapi/strapi').factories;
const { localDateISO } = require('../../../utils/local-date');

const PRODUCT_UID = 'api::product.product';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';
const STOCK_LEVEL_UID = 'api::stock-level.stock-level';
const STOCK_BATCH_UID = 'api::stock-batch.stock-batch';
const STORAGE_LOCATION_UID = 'api::storage-location.storage-location';
const BRANCH_UID = 'api::branch.branch';

// When true, the stock-item lifecycle skips the per-location stock-level
// recompute. The backfill flips this on while it bulk-places items so it can
// do a single full rebuild at the end instead of one recompute per item.
let _suppressStockLevel = false;

// ── Per-product allocation mutex ────────────────────────────────────────────
// Divisible allocate/release is read-modify-write on stock-item.units_sold with
// no DB row lock; two concurrent sales of the same product would both read the
// old units_sold and overwrite each other (oversell — the customer is charged
// but stock never drops). Serialize allocate + release per product so each sees
// the previous one's committed writes.
//
// This is an IN-PROCESS lock: it protects one Strapi instance (the current
// deployment — single container, no compose replicas). If Strapi is ever scaled
// horizontally, promote this to a DB advisory lock (MySQL GET_LOCK keyed by
// product) so the guarantee holds across instances.
const _productLocks = new Map(); // productKey -> tail Promise

function withProductLock(productKey, fn) {
  const key = String(productKey ?? '');
  if (!key) return fn();
  const prev = _productLocks.get(key) || Promise.resolve();
  let release;
  const mine = new Promise((res) => { release = res; });
  // Chain synchronously (no await between get and set) so concurrent callers
  // queue deterministically behind each other.
  const tail = prev.then(() => mine);
  _productLocks.set(key, tail);
  return prev.catch(() => {}).then(async () => {
    try {
      return await fn();
    } finally {
      release();
      if (_productLocks.get(key) === tail) _productLocks.delete(key);
    }
  });
}

module.exports = createCoreService(STOCK_ITEM_UID, ({ strapi }) => ({
  /**
   * Flip every InStock unit already past its expiry_date to status 'Expired'
   * (the lifecycle then drops it from product.stock_quantity + stock-level).
   * Idempotent; returns the count flipped. Epic 5 block-expired driver.
   */
  async sweepExpiredStockItems(asOfDate) {
    const t = asOfDate || localDateISO();
    const units = await strapi.db.query(STOCK_ITEM_UID).findMany({
      where: {
        status: 'InStock',
        $or: [{ archived: false }, { archived: { $null: true } }],
        expiry_date: { $notNull: true, $lt: t },
      },
      select: ['id'],
      limit: 100000,
    });
    let expired = 0;
    for (const u of units) {
      try {
        await strapi.entityService.update(STOCK_ITEM_UID, u.id, { data: { status: 'Expired' } });
        expired += 1;
      } catch (err) {
        strapi.log.warn(`[stock-item] sweepExpiredStockItems unit=${u.id} failed: ${err.message}`);
      }
    }
    if (expired > 0) strapi.log.info(`[stock-item] sweep-expired flipped ${expired} unit(s) past ${t}`);
    return expired;
  },

  /**
   * Inventory valuation (Epic 2) — specific-identification value of on-hand stock:
   *   serialized = Σ stock-item.cost_price for InStock, non-archived units
   *   bulk       = Σ (stock-batch.quantity_remaining × unit_cost) for Active batches
   * Broken down by branch (documentId; `unassigned` when a row has no branch).
   * Compute-on-read; on-demand admin report, not a hot path.
   *
   * @param {{ branchId?: number, branchDocId?: string }} opts
   */
  async computeInventoryValuation(opts = {}) {
    let branchId = opts.branchId || null;
    if (!branchId && opts.branchDocId) {
      const br = await strapi.db.query(BRANCH_UID).findOne({ where: { documentId: opts.branchDocId }, select: ['id'] });
      branchId = br?.id || null;
    }
    const branchFilter = branchId ? { branch: { id: branchId } } : {};
    const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

    const byBranch = new Map();
    const bucket = (b) => {
      const key = b?.documentId || 'unassigned';
      if (!byBranch.has(key)) byBranch.set(key, { branch: b?.documentId || null, branch_name: b?.name || null, serialized_value: 0, serialized_units: 0, bulk_value: 0, bulk_qty: 0 });
      return byBranch.get(key);
    };

    // Serialized — InStock, non-archived units.
    const items = await strapi.db.query(STOCK_ITEM_UID).findMany({
      where: { status: 'InStock', $or: [{ archived: false }, { archived: { $null: true } }], ...branchFilter },
      select: ['cost_price'],
      populate: { branch: { select: ['documentId', 'name'] } },
      limit: 5000000,
    });
    for (const it of items) { const b = bucket(it.branch); b.serialized_value += n(it.cost_price); b.serialized_units += 1; }

    // Bulk — Active batches, value = remaining × unit_cost.
    const batches = await strapi.db.query(STOCK_BATCH_UID).findMany({
      where: { status: 'Active', ...branchFilter },
      select: ['quantity_remaining', 'unit_cost'],
      populate: { branch: { select: ['documentId', 'name'] } },
      limit: 5000000,
    });
    for (const bt of batches) { const b = bucket(bt.branch); b.bulk_value += n(bt.quantity_remaining) * n(bt.unit_cost); b.bulk_qty += n(bt.quantity_remaining); }

    const round2 = (x) => Math.round(x * 100) / 100;
    const branches = Array.from(byBranch.values()).map((b) => ({
      ...b,
      serialized_value: round2(b.serialized_value),
      bulk_value: round2(b.bulk_value),
      total_value: round2(b.serialized_value + b.bulk_value),
    })).sort((a, b) => b.total_value - a.total_value);

    const serialized_value = round2(branches.reduce((s, b) => s + b.serialized_value, 0));
    const bulk_value = round2(branches.reduce((s, b) => s + b.bulk_value, 0));
    return {
      asOf: new Date().toISOString(),
      total_value: round2(serialized_value + bulk_value),
      serialized_value,
      bulk_value,
      serialized_units: branches.reduce((s, b) => s + b.serialized_units, 0),
      branches,
    };
  },

  /**
   * Coordinated expiry sweep across BOTH stock ledgers: serialized units and
   * bulk batches past expiry → 'Expired'. Shared by the daily cron and the
   * manual POST /stock-items/sweep-expired endpoint. Returns { items, batches, asOf }.
   */
  async sweepExpired(asOfDate) {
    const t = asOfDate || localDateISO();
    const items = await this.sweepExpiredStockItems(t);
    let batches = 0;
    try {
      batches = await strapi.service('api::stock-batch.stock-batch').sweepExpiredBatches(t);
    } catch (err) {
      strapi.log.warn(`[stock-item] batch expiry sweep failed: ${err.message}`);
    }
    return { items, batches, asOf: t };
  },

  /**
   * Recompute the InStock cache for one product.
   *
   * Counts live stock-item rows in status='InStock' (excluding archived) and
   * writes the result onto every product row sharing the product's documentId
   * — so draft and published editions stay in lockstep. Idempotent.
   */
  async recomputeProductStock(productId) {
    if (!productId) return null;

    const count = await strapi.db.query(STOCK_ITEM_UID).count({
      where: {
        product: productId,
        status: 'InStock',
        $or: [{ archived: false }, { archived: { $null: true } }],
      },
    });

    // Look up the documentId so we can update every edition (draft + published)
    // at once. If the row only exists in one edition, the documentId-scoped
    // updateMany still patches it.
    const row = await strapi.db.query(PRODUCT_UID).findOne({
      where: { id: productId },
      select: ['id', 'documentId'],
    });

    if (!row) return count;

    if (row.documentId) {
      await strapi.db.query(PRODUCT_UID).updateMany({
        where: { documentId: row.documentId },
        data: { stock_quantity: count },
      });
    } else {
      await strapi.db.query(PRODUCT_UID).update({
        where: { id: productId },
        data: { stock_quantity: count },
      });
    }

    return count;
  },

  /**
   * Recompute product.sellable_quantity — the divisible-stock analog of
   * stock_quantity: the sum of REMAINING sub-units (sellable_units − units_sold)
   * across InStock, non-archived items. For ordinary items (sellable_units 1,
   * units_sold 0) each contributes 1, so this equals the InStock count — a safe
   * superset that's meaningful for divisible products (tablet box, lace roll).
   * Writes every edition via documentId. See [[project_stock_model_invariant]].
   */
  async recomputeSellableQuantity(productId) {
    if (!productId) return null;
    const items = await strapi.db.query(STOCK_ITEM_UID).findMany({
      where: { product: productId, status: 'InStock', $or: [{ archived: false }, { archived: { $null: true } }] },
      select: ['sellable_units', 'units_sold'],
      limit: 5000000,
    });
    const sum = items.reduce((s, it) => {
      const total = Number(it.sellable_units);
      const remaining = (Number.isFinite(total) ? total : 1) - (Number(it.units_sold) || 0);
      return s + (remaining > 0 ? remaining : 0);
    }, 0);
    const rounded = Math.round(sum * 1000) / 1000;

    const row = await strapi.db.query(PRODUCT_UID).findOne({ where: { id: productId }, select: ['id', 'documentId'] });
    if (!row) return rounded;
    if (row.documentId) {
      await strapi.db.query(PRODUCT_UID).updateMany({ where: { documentId: row.documentId }, data: { sellable_quantity: rounded } });
    } else {
      await strapi.db.query(PRODUCT_UID).update({ where: { id: productId }, data: { sellable_quantity: rounded } });
    }
    return rounded;
  },

  /**
   * Per-sub-unit price for a divisible item: the whole-item selling_price divided
   * by its total sellable_units (the price stays fixed; portions are pro-rata).
   * Falls back to the whole price when the item isn't divisible.
   */
  sellableUnitPrice(item) {
    const total = Number(item?.sellable_units) || 1;
    const price = Number(item?.selling_price) || 0;
    return total > 0 ? price / total : price;
  },

  /**
   * Allocate `qty` sellable sub-units of a divisible product across its InStock
   * items and consume them (Divisible P2). Ordering:
   *   - a scanned item is honoured first (with a warning if a nearer-expiry item
   *     is being skipped);
   *   - otherwise ALREADY-OPENED items (units_sold > 0) are drawn down first so a
   *     new full item isn't broken unnecessarily, each in FEFO order (earliest
   *     expiry, nulls last), then createdAt.
   * Each consumed item's units_sold grows; an item hitting its capacity flips to
   * 'Sold'. Per-unit price = selling_price ÷ sellable_units. Returns the
   * allocation records (for the sale line + later returns), the total units and
   * price, and any warning. `dryRun` computes without mutating. If total remaining
   * is below `qty` it returns { insufficient, available } and consumes nothing.
   *
   * @param {number} productId
   * @param {number} qty
   * @param {{ scannedItemDocId?: string, dryRun?: boolean }} [opts]
   */
  async allocateSellableUnits(productId, qty, opts = {}) {
    const need = Number(qty);
    if (!productId || !(need > 0)) return { allocations: [], totalUnits: 0, totalPrice: 0 };
    // A real allocation mutates units_sold — serialize per product so concurrent
    // sales don't lose updates. dryRun only reads, so it needs no lock.
    if (opts.dryRun) return this._allocateSellableUnitsUnlocked(productId, need, opts);
    return withProductLock(productId, () => this._allocateSellableUnitsUnlocked(productId, need, opts));
  },

  async _allocateSellableUnitsUnlocked(productId, need, opts = {}) {
    const rows = await strapi.db.query(STOCK_ITEM_UID).findMany({
      where: { product: productId, status: 'InStock', $or: [{ archived: false }, { archived: { $null: true } }] },
      select: ['id', 'documentId', 'sellable_units', 'units_sold', 'selling_price', 'expiry_date', 'createdAt'],
      limit: 100000,
    });
    // Exclude already-expired units — the daily sweep flips them to 'Expired'
    // but between expiry and the next sweep they'd otherwise sort FIRST (nearest
    // expiry) and be sold. A null expiry_date never expires.
    const today = localDateISO();
    const items = rows
      .map((it) => ({ ...it, remaining: (Number(it.sellable_units) || 1) - (Number(it.units_sold) || 0) }))
      .filter((it) => it.remaining > 1e-9)
      .filter((it) => !it.expiry_date || String(it.expiry_date).slice(0, 10) >= today);

    const available = Math.round(items.reduce((s, it) => s + it.remaining, 0) * 1000) / 1000;
    if (available + 1e-9 < need) {
      return { insufficient: true, available, allocations: [], totalUnits: 0, totalPrice: 0 };
    }

    const fefoKey = (it) => (it.expiry_date ? String(it.expiry_date).slice(0, 10) : '9999-12-31');
    const openedFirstFefo = (a, b) => {
      const ao = (Number(a.units_sold) || 0) > 0 ? 0 : 1;
      const bo = (Number(b.units_sold) || 0) > 0 ? 0 : 1;
      if (ao !== bo) return ao - bo;               // opened items first
      const ax = fefoKey(a); const bx = fefoKey(b);
      if (ax !== bx) return ax < bx ? -1 : 1;      // FEFO
      return (a.id || 0) - (b.id || 0);            // stable / createdAt-ish
    };

    let ordered;
    let warning = null;
    if (opts.scannedItemDocId) {
      const scanned = items.find((it) => it.documentId === opts.scannedItemDocId);
      const rest = items.filter((it) => it.documentId !== opts.scannedItemDocId).sort(openedFirstFefo);
      ordered = scanned ? [scanned, ...rest] : rest;
      if (scanned) {
        const nearer = items.find((it) => it.documentId !== scanned.documentId && fefoKey(it) < fefoKey(scanned));
        if (nearer) warning = `Selling a unit expiring ${fefoKey(scanned)} while a nearer-expiry unit (${fefoKey(nearer)}) is available.`;
      }
    } else {
      ordered = [...items].sort(openedFirstFefo);
    }

    const allocations = [];
    let remainingNeed = need;
    let totalPrice = 0;
    for (const it of ordered) {
      if (remainingNeed <= 1e-9) break;
      const take = Math.min(it.remaining, remainingNeed);
      if (take <= 1e-9) continue;
      const total = Number(it.sellable_units) || 1;
      const newSold = (Number(it.units_sold) || 0) + take;
      const depleted = newSold + 1e-9 >= total;
      const unitPrice = this.sellableUnitPrice(it);
      const lineTotal = Math.round(take * unitPrice * 100) / 100;

      if (!opts.dryRun) {
        await strapi.entityService.update(STOCK_ITEM_UID, it.id, {
          data: { units_sold: depleted ? total : Math.round(newSold * 1000) / 1000, ...(depleted ? { status: 'Sold' } : {}) },
        });
      }
      allocations.push({ stock_item: it.documentId, stock_item_id: it.id, units: Math.round(take * 1000) / 1000, unit_price: unitPrice, line_total: lineTotal, depleted });
      totalPrice += lineTotal;
      remainingNeed -= take;
    }

    return {
      allocations,
      totalUnits: Math.round((need - Math.max(0, remainingNeed)) * 1000) / 1000,
      totalPrice: Math.round(totalPrice * 100) / 100,
      ...(warning ? { warning } : {}),
    };
  },

  /**
   * Reverse an allocation (Divisible P3 — return/void). For each recorded
   * allocation { stock_item(_id), units }, subtract the units from the item's
   * units_sold (floored at 0); if the item had been depleted to 'Sold' (and isn't
   * archived) it re-opens to 'InStock' since it now has remaining units again.
   * The lifecycle refreshes product.sellable_quantity. Idempotent-ish: a missing
   * item is skipped, not fatal.
   *
   * @param {Array<{ stock_item?: string, stock_item_id?: number, units: number }>} allocations
   */
  async releaseSellableUnits(allocations, opts = {}) {
    const list = Array.isArray(allocations) ? allocations : [];
    if (list.length === 0) return { released: 0, results: [] };

    // Lock on the same key as allocate (the product) so a release can't
    // interleave with a concurrent sale of the same product. Resolve the product
    // from the caller (preferred) or the first allocation's stock-item.
    let productKey = opts.productId || null;
    if (!productKey) {
      const first = list.find((a) => a.stock_item_id || a.stock_item);
      if (first) {
        const where = first.stock_item_id ? { id: first.stock_item_id } : { documentId: first.stock_item };
        const it = await strapi.db.query(STOCK_ITEM_UID).findOne({ where, populate: { product: { select: ['id'] } } });
        productKey = it?.product?.id || null;
      }
    }
    return withProductLock(productKey, () => this._releaseSellableUnitsUnlocked(list));
  },

  async _releaseSellableUnitsUnlocked(list) {
    const results = [];
    for (const a of list) {
      let id = a.stock_item_id || null;
      if (!id && a.stock_item) {
        const r = await strapi.db.query(STOCK_ITEM_UID).findOne({ where: { documentId: a.stock_item }, select: ['id'] });
        id = r?.id || null;
      }
      const units = Number(a.units) || 0;
      if (!id || !(units > 0)) { results.push({ stock_item_id: id, ok: false, reason: 'no id / units' }); continue; }

      const it = await strapi.db.query(STOCK_ITEM_UID).findOne({ where: { id }, select: ['id', 'sellable_units', 'units_sold', 'status', 'archived'] });
      if (!it) { results.push({ stock_item_id: id, ok: false, reason: 'not found' }); continue; }
      const total = Number(it.sellable_units) || 1;
      const newSold = Math.max(0, (Number(it.units_sold) || 0) - units);
      const reopen = it.status === 'Sold' && !it.archived && newSold + 1e-9 < total;
      try {
        await strapi.entityService.update(STOCK_ITEM_UID, id, {
          data: { units_sold: Math.round(newSold * 1000) / 1000, ...(reopen ? { status: 'InStock' } : {}) },
        });
        results.push({ stock_item_id: id, ok: true, units_sold: Math.round(newSold * 1000) / 1000, reopened: reopen });
      } catch (err) {
        results.push({ stock_item_id: id, ok: false, reason: err.message });
      }
    }
    return { released: results.filter((r) => r.ok).length, results };
  },

  /**
   * POS immediate-sale entry point (Divisible P2c): sell `qty` sub-units of a
   * divisible product by documentId. Resolves the product, allocates+consumes via
   * allocateSellableUnits (opened-first → FEFO, depleted→Sold), and — when a
   * sale-item documentId is supplied — connects every touched stock-item to it so
   * the sale keeps a traceable link back to the physical units (needed for later
   * returns). Throws { status:409, available } when short. Returns the allocation
   * result verbatim ({ allocations, totalUnits, totalPrice, warning }).
   *
   * Idempotent-by-target when a sale-item is supplied: `qty` is the TOTAL the
   * line should have consumed, not an increment. A retry (e.g. checkout replays
   * after a mid-batch failure) that passes the same qty consumes nothing and
   * returns the already-recorded allocations, so stock is never double-sold. If
   * the line needs more than it has, only the difference is allocated and the
   * line's `allocations` JSON is extended (this record is what returns replay).
   *
   * @param {string} productDocId
   * @param {number} qty
   * @param {{ scannedItemDocId?: string, saleItemDocId?: string }} [opts]
   */
  async sellDivisibleUnits(productDocId, qty, opts = {}) {
    if (!productDocId) { const e = new Error('product_document_id is required'); e.status = 400; throw e; }
    const product = await strapi.db.query('api::product.product').findOne({
      where: { documentId: productDocId }, select: ['id', 'divisible'],
    });
    if (!product) { const e = new Error('Product not found'); e.status = 404; throw e; }
    // Portion-selling is only valid for divisible products. Without this check,
    // qty N against an ordinary product (sellable_units defaults to 1) silently
    // flips N whole items to Sold with no sale attached to most of them.
    if (product.divisible !== true) { const e = new Error('Product is not divisible — portion selling is not allowed'); e.status = 400; throw e; }

    const want = Number(qty);
    const round3 = (n) => Math.round(n * 1000) / 1000;
    const round2 = (n) => Math.round(n * 100) / 100;

    // Idempotency: reconcile the line to `want` total units. Read what it has
    // already consumed from its recorded allocations.
    let existing = [];
    if (opts.saleItemDocId) {
      try {
        const si = await strapi.documents('api::sale-item.sale-item').findOne({
          documentId: opts.saleItemDocId, fields: ['allocations'],
        });
        existing = Array.isArray(si?.allocations) ? si.allocations : [];
      } catch (_) { /* line not found yet — treat as none */ }
    }
    const existingUnits = round3(existing.reduce((s, a) => s + (Number(a.units) || 0), 0));
    const toSell = round3(want - existingUnits);

    if (toSell <= 1e-9) {
      // Already satisfied (a retry, or a request to reduce which we don't
      // over-release here). Consume nothing; report the current state.
      const totalPrice = round2(existing.reduce((s, a) => s + (Number(a.line_total) || 0), 0));
      return { allocations: existing, totalUnits: existingUnits, totalPrice, idempotent: true };
    }

    const result = await this.allocateSellableUnits(product.id, toSell, { scannedItemDocId: opts.scannedItemDocId });
    if (result.insufficient) { const e = new Error(`Only ${result.available} sub-unit(s) available`); e.status = 409; e.available = result.available; throw e; }

    const merged = [...existing, ...result.allocations];

    // Persist the allocation record + link the consumed units to the sale-item.
    // The `allocations` JSON is the source of truth for a later return (which
    // sub-units, from which rolls) — without it, returns cannot restore units.
    // Best-effort: a link failure must not void a completed sale, but a persist
    // failure would break returns, so it is logged loudly.
    if (opts.saleItemDocId) {
      const ids = result.allocations.map((a) => a.stock_item).filter(Boolean);
      try {
        await strapi.documents('api::sale-item.sale-item').update({
          documentId: opts.saleItemDocId,
          data: {
            allocations: merged,
            sellable_qty: round3(existingUnits + result.totalUnits),
            ...(ids.length ? { items: { connect: ids } } : {}),
          },
        });
      } catch (err) {
        strapi.log.error(`[sellDivisibleUnits] persisting allocations to sale-item ${opts.saleItemDocId} failed — returns for this line will not restore units: ${err.message}`);
      }
    }

    return {
      allocations: merged,
      totalUnits: round3(existingUnits + result.totalUnits),
      totalPrice: round2(existing.reduce((s, a) => s + (Number(a.line_total) || 0), 0) + result.totalPrice),
      ...(result.warning ? { warning: result.warning } : {}),
    };
  },

  /**
   * Return `units` sub-units of a DIVISIBLE sale-item back to stock. Reads the
   * sale-item's recorded allocations, peels `units` off the tail (splitting a
   * straddling entry proportionally), releases them via releaseSellableUnits
   * (decrementing units_sold and reopening depleted rolls), and rewrites the
   * sale-item's allocations/sellable_qty to what remains. This is the divisible
   * counterpart of a whole-item return — the roll is NOT status-flipped (which
   * the stock-item lifecycle guard blocks for partially-sold rolls).
   *
   * @param {string} saleItemDocId
   * @param {number} units
   * @returns {{ released:number, units:number, remaining:number, refundBasis:number }}
   */
  async returnDivisibleUnits(saleItemDocId, units) {
    if (!saleItemDocId) { const e = new Error('sale_item_document_id is required'); e.status = 400; throw e; }
    const want = Number(units);
    if (!(want > 0)) { const e = new Error('units (positive number) is required'); e.status = 400; throw e; }

    const round3 = (n) => Math.round(n * 1000) / 1000;
    const round2 = (n) => Math.round(n * 100) / 100;

    const si = await strapi.documents('api::sale-item.sale-item').findOne({
      documentId: saleItemDocId, fields: ['allocations', 'sellable_qty'],
      populate: { product: { fields: ['id'] } },
    });
    if (!si) { const e = new Error('Sale item not found'); e.status = 404; throw e; }
    const existing = Array.isArray(si.allocations) ? si.allocations : [];
    const soldUnits = round3(existing.reduce((s, a) => s + (Number(a.units) || 0), 0));
    if (soldUnits <= 1e-9) { const e = new Error('This line has no divisible units to return'); e.status = 400; throw e; }
    if (want - soldUnits > 1e-9) { const e = new Error(`Cannot return ${want} — only ${soldUnits} sub-unit(s) were sold on this line`); e.status = 400; throw e; }

    // Peel `want` units off the tail of the allocations.
    let toRelease = round3(want);
    const keep = [];
    const releasedAllocs = [];
    for (let i = existing.length - 1; i >= 0; i--) {
      const a = existing[i];
      const u = Number(a.units) || 0;
      if (toRelease <= 1e-9) { keep.unshift(a); continue; }
      if (u <= toRelease + 1e-9) {
        releasedAllocs.push(a);
        toRelease = round3(toRelease - u);
      } else {
        const rel = round3(toRelease);
        const remain = round3(u - rel);
        const unitPrice = Number(a.unit_price) || 0;
        keep.unshift({ ...a, units: remain, line_total: round2(remain * unitPrice), depleted: false });
        releasedAllocs.push({ ...a, units: rel, line_total: round2(rel * unitPrice) });
        toRelease = 0;
      }
    }

    const productId = si.product?.id || null;
    const rel = await this.releaseSellableUnits(releasedAllocs, { productId });

    const remainingUnits = round3(keep.reduce((s, a) => s + (Number(a.units) || 0), 0));
    const refundBasis = round2(releasedAllocs.reduce((s, a) => s + (Number(a.line_total) || 0), 0));
    try {
      await strapi.documents('api::sale-item.sale-item').update({
        documentId: saleItemDocId,
        data: { allocations: keep, sellable_qty: remainingUnits },
      });
    } catch (err) {
      strapi.log.warn(`[returnDivisibleUnits] updating sale-item ${saleItemDocId} after release failed: ${err.message}`);
    }

    return { released: rel.released, units: round3(want), remaining: remainingUnits, refundBasis };
  },

  /**
   * Recompute multiple products. Deduplicates ids and walks them serially —
   * each recompute is one COUNT + one UPDATE, so the cost is linear and the
   * sequential order keeps DB load predictable during bulk operations.
   */
  async recomputeProductsStock(productIds) {
    const unique = Array.from(new Set((productIds || []).filter(Boolean)));
    const results = {};
    for (const pid of unique) {
      try {
        results[pid] = await this.recomputeProductStock(pid);
      } catch (err) {
        strapi.log.warn(`[stock-item] recompute product=${pid} failed: ${err.message}`);
        results[pid] = null;
      }
    }
    return results;
  },

  /**
   * Job — recompute `stock_quantity` for every product in the DB.
   *
   * Triggered on demand (admin endpoint, CLI, ad-hoc invocation). Idempotent.
   * The stock-item lifecycle keeps the cache fresh during normal operation;
   * this job exists for post-migration backfill, post-incident reconciliation,
   * or any time the cache is suspected of drifting.
   *
   * Returns a summary so the caller can surface what it did.
   */
  async recomputeAllProducts() {
    const started = Date.now();

    // No `limit` — the low-level db.query engine returns all matching rows when
    // limit is omitted. (`limit: -1` is a Document/Entity Service convention
    // only; at this layer it passes straight through to SQL as `LIMIT -1`,
    // which MySQL rejects.)
    const rows = await strapi.db.query(PRODUCT_UID).findMany({
      select: ['id', 'documentId', 'stock_quantity'],
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return { processed: 0, corrected: 0, durationMs: Date.now() - started };
    }

    // Group by documentId so each logical product is processed once. The
    // recompute writes to every edition via documentId — no need to repeat
    // the work for draft/published twins.
    const seen = new Set();
    const targets = [];
    for (const r of rows) {
      const key = r.documentId || `id:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(r);
    }

    let processed = 0;
    let corrected = 0;
    const errors = [];

    for (const product of targets) {
      try {
        const newCount = await this.recomputeProductStock(product.id);
        processed += 1;
        const previous = Number(product.stock_quantity) || 0;
        if (newCount != null && newCount !== previous) corrected += 1;
      } catch (err) {
        errors.push({ productId: product.id, message: err.message });
        strapi.log.warn(
          `[stock-item] recomputeAllProducts product=${product.id} failed: ${err.message}`
        );
      }
    }

    return {
      processed,
      corrected,
      errors,
      durationMs: Date.now() - started,
    };
  },

  // ---------------------------------------------------------------------------
  // Per-location stock-level cache (Foundation F2).
  //
  // stock-level is a denormalised per-(product, branch) twin of
  // product.stock_quantity. The global invariant is preserved:
  //   Σ stock-level.quantity_on_hand across branches === product.stock_quantity
  // (both count InStock, non-archived units). recomputeProductStock still owns
  // the global cache untouched; these methods maintain the per-branch split.
  //
  // The auto-maintained rows are branch-level (storage_location & batch NULL).
  // Finer-grained bin/batch rows are a later refinement. Units with no branch
  // (not yet placed) are excluded from stock-level but still counted globally, so
  // Σ stock-level can be < product.stock_quantity until every unit has a branch.
  // ---------------------------------------------------------------------------

  suppressStockLevelRecompute(value = true) {
    _suppressStockLevel = !!value;
  },

  isStockLevelRecomputeSuppressed() {
    return _suppressStockLevel;
  },

  /**
   * Rebuild the branch-level stock-level rows for one product from live
   * stock-item rows. Idempotent. Returns the number of rows written.
   */
  async recomputeStockLevelsForProduct(productId) {
    if (!productId) return 0;

    // Work at documentId granularity, not per product-edition-id: a stock-item
    // (not draft/published itself) is linked to BOTH the draft and the published
    // edition of its product, so counting per edition would double it. Count each
    // item once (by documentId, deduped) and keep exactly one branch-level
    // stock-level row per (document, branch).
    const prod = await strapi.db.query(PRODUCT_UID).findOne({
      where: { id: productId }, select: ['id', 'documentId'],
    });
    if (!prod) return 0;
    const docId = prod.documentId || null;

    // Stable edition to attach rows to (min id across the document's editions).
    let canonicalPid = prod.id;
    if (docId) {
      const eds = await strapi.db.query(PRODUCT_UID).findMany({
        where: { documentId: docId }, select: ['id'],
      });
      const ids = (eds || []).map((e) => e.id).filter((n) => Number.isFinite(n));
      if (ids.length) canonicalPid = Math.min(...ids);
    }

    const scopeWhere = docId ? { product: { documentId: docId } } : { product: prod.id };

    const items = await strapi.db.query(STOCK_ITEM_UID).findMany({
      where: { ...scopeWhere, $or: [{ archived: false }, { archived: { $null: true } }] },
      select: ['id', 'status'],
      populate: { branch: { select: ['id'] } },
    });
    // Dedupe by item id — the doc-level join can surface an item once per linked edition.
    const byItem = new Map();
    for (const it of items || []) if (!byItem.has(it.id)) byItem.set(it.id, it);

    const onHand = new Map();   // branchId -> count of InStock units
    const reserved = new Map(); // branchId -> count of Reserved units
    for (const it of byItem.values()) {
      const brId = it.branch?.id;
      if (!brId) continue; // unplaced units aren't bucketed into a stock-level
      if (it.status === 'InStock') onHand.set(brId, (onHand.get(brId) || 0) + 1);
      else if (it.status === 'Reserved') reserved.set(brId, (reserved.get(brId) || 0) + 1);
    }

    // Existing branch-level rows (storage_location & batch NULL) for this
    // document — keep one per branch, delete duplicates a prior per-edition
    // pass may have created.
    const existingRows = await strapi.db.query(STOCK_LEVEL_UID).findMany({
      where: scopeWhere,
      select: ['id'],
      populate: {
        branch: { select: ['id'] },
        storage_location: { select: ['id'] },
        batch: { select: ['id'] },
      },
    });
    const keptByBranch = new Map();
    const dupIds = [];
    for (const row of existingRows || []) {
      if (row.storage_location?.id || row.batch?.id) continue; // only branch-level rows
      const b = row.branch?.id;
      if (!b) { dupIds.push(row.id); continue; }
      if (keptByBranch.has(b)) dupIds.push(row.id);
      else keptByBranch.set(b, row.id);
    }
    for (const id of dupIds) {
      try { await strapi.db.query(STOCK_LEVEL_UID).delete({ where: { id } }); } catch (_) { /* noop */ }
    }

    const branchIds = new Set([
      ...onHand.keys(),
      ...reserved.keys(),
      ...keptByBranch.keys(),
    ]);

    let written = 0;
    for (const brId of branchIds) {
      const oh = onHand.get(brId) || 0;
      const rv = reserved.get(brId) || 0;
      const data = {
        quantity_on_hand: oh,
        quantity_reserved: rv,
        quantity_available: oh,
      };
      const rowId = keptByBranch.get(brId);
      if (rowId) {
        await strapi.db.query(STOCK_LEVEL_UID).update({ where: { id: rowId }, data });
        written += 1;
      } else if (oh > 0 || rv > 0) {
        await strapi.db.query(STOCK_LEVEL_UID).create({
          data: { product: canonicalPid, branch: brId, ...data },
        });
        written += 1;
      }
    }

    return written;
  },

  /**
   * Recompute stock-levels for several products. Dedupes and walks serially.
   */
  async recomputeStockLevelsForProducts(productIds) {
    const unique = Array.from(new Set((productIds || []).filter(Boolean)));
    let written = 0;
    for (const pid of unique) {
      try {
        written += await this.recomputeStockLevelsForProduct(pid);
      } catch (err) {
        strapi.log.warn(`[stock-item] recompute stock-levels product=${pid} failed: ${err.message}`);
      }
    }
    return written;
  },

  /**
   * Resolve a relation's join-table shape from Strapi metadata so the backfill
   * and rebuild can do set-based SQL without hard-coding table/column names.
   * Returns { table, itemCol, targetCol, ordCol } or null when the relation has
   * no join table (or metadata is unavailable).
   */
  _relJoinInfo(uid, attrName) {
    try {
      const meta = strapi.db.metadata.get(uid);
      const attr = meta?.attributes?.[attrName];
      const jt = attr && attr.joinTable;
      if (!jt || !jt.name) return null;
      return {
        table: jt.name,
        itemCol: jt.joinColumn?.name || null,
        targetCol: jt.inverseJoinColumn?.name || null,
        ordCol: jt.orderColumnName || null,
      };
    } catch (_) {
      return null;
    }
  },

  /**
   * Job — rebuild stock-level rows. Idempotent. The stock-item lifecycle keeps
   * them fresh during normal operation; this is the full-DB rebuild for
   * post-backfill / drift reconciliation.
   *
   * Processes one representative edition per product DOCUMENT — the product ids
   * actually referenced by stock-items (and existing stock-level rows) are read
   * off the relation join tables, then collapsed to one id per documentId so
   * recomputeStockLevelsForProduct (which itself works at documentId level) runs
   * once per logical product. This both avoids the draft/published double-count
   * and cleans up any duplicate rows a prior per-edition pass created.
   */
  async recomputeAllStockLevels() {
    const started = Date.now();

    const editionIds = new Set();
    const prodJt = this._relJoinInfo(STOCK_ITEM_UID, 'product');
    const slProdJt = this._relJoinInfo(STOCK_LEVEL_UID, 'product');
    try {
      const knex = strapi.db.connection;
      const scan = async (jt) => {
        if (!jt?.table || !jt.targetCol) return;
        const rows = await knex(jt.table).distinct(jt.targetCol).whereNotNull(jt.targetCol);
        for (const row of rows) {
          const v = row[jt.targetCol];
          if (v != null) editionIds.add(v);
        }
      };
      await scan(prodJt);
      await scan(slProdJt);
    } catch (err) {
      strapi.log.warn(`[stock-item] recomputeAllStockLevels: join-table scan failed (${err.message}); falling back to full product scan`);
    }

    // Collapse referenced edition ids to one representative id per documentId.
    const repByDoc = new Map();
    if (editionIds.size > 0) {
      const rows = await strapi.db.query(PRODUCT_UID).findMany({
        where: { id: { $in: [...editionIds] } }, select: ['id', 'documentId'],
      });
      for (const r of rows || []) {
        const key = r.documentId || `id:${r.id}`;
        if (!repByDoc.has(key)) repByDoc.set(key, r.id);
      }
    }
    // Fallback: full product scan, one representative per documentId.
    if (repByDoc.size === 0) {
      const rows = await strapi.db.query(PRODUCT_UID).findMany({ select: ['id', 'documentId'] });
      for (const r of rows || []) {
        const key = r.documentId || `id:${r.id}`;
        if (!repByDoc.has(key)) repByDoc.set(key, r.id);
      }
    }

    let processed = 0;
    let levelsWritten = 0;
    const errors = [];
    for (const pid of repByDoc.values()) {
      try {
        levelsWritten += await this.recomputeStockLevelsForProduct(pid);
        processed += 1;
      } catch (err) {
        errors.push({ productId: pid, message: err.message });
        strapi.log.warn(`[stock-item] recomputeAllStockLevels product=${pid} failed: ${err.message}`);
      }
    }

    return { processed, levelsWritten, errors, durationMs: Date.now() - started };
  },

  /**
   * Foundation backfill (Epic 2 Phase 1). Idempotent one-time job:
   *   1. Ensure every branch has a default receiving storage-location.
   *   2. Place every stock-item that lacks a storage_location into its branch's
   *      receiving location. Branch-less / stray items get a fallback branch too
   *      so the Σ stock-level == on-hand invariant holds.
   *   3. Rebuild the stock-level cache.
   *
   * Placement is set-based SQL against the relation join tables (one INSERT…
   * SELECT per branch + a catch-all), so a 30k+ item table backfills in
   * seconds. If the join-table shape can't be resolved from metadata (or the
   * bulk SQL throws), it falls back to a correct-but-slow per-row ORM loop.
   * Only touches items that lack a location, so re-running is safe.
   */
  async backfillDefaultLocations() {
    const started = Date.now();
    let branchesCreated = 0;
    let locationsCreated = 0;
    let itemsPlaced = 0;
    let mode = 'bulk';

    const branchDefaults = new Map(); // branchId -> { locId }
    let fallback = null;              // { branchId, locId }

    // --- 1. Ensure a default receiving storage-location per branch (ORM; small N).
    const ensureReceiving = async (branchId) => {
      let loc = await strapi.db.query(STORAGE_LOCATION_UID).findOne({
        where: { branch: branchId, is_receivable: true },
        select: ['id'],
      });
      if (!loc) {
        loc = await strapi.db.query(STORAGE_LOCATION_UID).create({
          data: {
            code: 'RECV', name: 'Receiving', type: 'staging',
            is_receivable: true, is_pickable: true, is_active: true, branch: branchId,
          },
        });
        locationsCreated += 1;
      }
      return loc.id;
    };

    let branches = await strapi.db.query(BRANCH_UID).findMany({ select: ['id', 'name'] });
    if (!branches || branches.length === 0) {
      // No branch exists — create a fallback so every unit can be placed.
      const b = await strapi.db.query(BRANCH_UID).create({
        data: { name: 'Main Branch', location_code: 'MAIN', location_type: 'warehouse', is_default_location: true, is_active: true },
      });
      branchesCreated += 1;
      branches = [b];
    }
    for (const b of branches) {
      const locId = await ensureReceiving(b.id);
      branchDefaults.set(b.id, { locId });
      if (!fallback) fallback = { branchId: b.id, locId };
    }

    // --- 2. Placement.
    const knex = strapi.db.connection;
    let stockTable = null;
    try { stockTable = strapi.db.metadata.get(STOCK_ITEM_UID).tableName; } catch (_) { /* noop */ }
    const locJt = this._relJoinInfo(STOCK_ITEM_UID, 'storage_location');
    const brJt = this._relJoinInfo(STOCK_ITEM_UID, 'branch');
    const canBulk = !!(knex && stockTable
      && locJt?.table && locJt.itemCol && locJt.targetCol
      && brJt?.table && brJt.itemCol && brJt.targetCol);

    // Correct-but-slow ORM placement — the fallback path.
    const ormPlacement = async () => {
      let placed = 0;
      this.suppressStockLevelRecompute(true);
      try {
        const PAGE = 500;
        let guard = 0;
        while (guard < 100000) {
          guard += 1;
          const batch = await strapi.db.query(STOCK_ITEM_UID).findMany({
            where: { storage_location: null }, select: ['id'],
            populate: { branch: { select: ['id'] } }, limit: PAGE,
          });
          if (!batch || batch.length === 0) break;
          for (const it of batch) {
            const bId = it.branch?.id;
            const def = (bId && branchDefaults.get(bId)) || fallback;
            const data = { storage_location: def.locId };
            if (!bId) data.branch = fallback.branchId; // give branch-less items a branch
            await strapi.db.query(STOCK_ITEM_UID).update({
              where: { id: it.id }, data,
            });
            placed += 1;
          }
          if (batch.length < PAGE) break;
        }
      } finally {
        this.suppressStockLevelRecompute(false);
      }
      return placed;
    };

    if (canBulk) {
      try {
        const q = (id) => '`' + id + '`';
        const affected = (r) => {
          const res = Array.isArray(r) ? r[0] : r;
          return (res && (res.affectedRows ?? res.rowCount)) || 0;
        };
        // Insert a link for items of a given branch that aren't already linked,
        // sourcing the item set from the branch join table.
        const placeByBranch = async (link, targetId, branchId) => {
          const cols = [q(link.itemCol), q(link.targetCol)];
          const sels = ['b.' + q(brJt.itemCol), '?'];
          if (link.ordCol) { cols.push(q(link.ordCol)); sels.push('b.' + q(brJt.itemCol)); }
          const sql =
            'insert into ' + q(link.table) + ' (' + cols.join(', ') + ') ' +
            'select ' + sels.join(', ') + ' from ' + q(brJt.table) + ' b ' +
            'where b.' + q(brJt.targetCol) + ' = ? and b.' + q(brJt.itemCol) + ' is not null ' +
            'and b.' + q(brJt.itemCol) + ' not in (select ' + q(link.itemCol) + ' from ' + q(link.table) + ' where ' + q(link.itemCol) + ' is not null)';
          return affected(await knex.raw(sql, [targetId, branchId]));
        };
        // Catch-all: any item still unlinked (branch-less or stray) -> fallback.
        const placeRemaining = async (link, targetId) => {
          const cols = [q(link.itemCol), q(link.targetCol)];
          const sels = ['si.id', '?'];
          if (link.ordCol) { cols.push(q(link.ordCol)); sels.push('si.id'); }
          const sql =
            'insert into ' + q(link.table) + ' (' + cols.join(', ') + ') ' +
            'select ' + sels.join(', ') + ' from ' + q(stockTable) + ' si ' +
            'where si.id not in (select ' + q(link.itemCol) + ' from ' + q(link.table) + ' where ' + q(link.itemCol) + ' is not null)';
          return affected(await knex.raw(sql, [targetId]));
        };

        // Give branch-less items a branch first so per-branch loc placement covers them.
        await placeRemaining(brJt, fallback.branchId);
        for (const [branchId, def] of branchDefaults) {
          itemsPlaced += await placeByBranch(locJt, def.locId, branchId);
        }
        // Safety net: any item still without a location -> fallback receiving loc.
        await placeRemaining(locJt, fallback.locId);
      } catch (err) {
        strapi.log.warn(`[stock-item] bulk placement failed (${err.message}); falling back to ORM loop`);
        mode = 'orm-fallback';
        itemsPlaced = await ormPlacement();
      }
    } else {
      mode = 'orm';
      itemsPlaced = await ormPlacement();
    }

    // --- 3. Rebuild the stock-level cache.
    const levels = await this.recomputeAllStockLevels();

    return {
      mode,
      branchesCreated,
      locationsCreated,
      itemsPlaced,
      levelsWritten: levels.levelsWritten,
      productsProcessed: levels.processed,
      durationMs: Date.now() - started,
    };
  },
}));
