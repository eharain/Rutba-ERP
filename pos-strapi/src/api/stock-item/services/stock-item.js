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

const PRODUCT_UID = 'api::product.product';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';
const STOCK_LEVEL_UID = 'api::stock-level.stock-level';
const WAREHOUSE_UID = 'api::warehouse.warehouse';
const STORAGE_LOCATION_UID = 'api::storage-location.storage-location';
const BRANCH_UID = 'api::branch.branch';

// When true, the stock-item lifecycle skips the per-location stock-level
// recompute. The backfill flips this on while it bulk-places items so it can
// do a single full rebuild at the end instead of one recompute per item.
let _suppressStockLevel = false;

module.exports = createCoreService(STOCK_ITEM_UID, ({ strapi }) => ({
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
  // stock-level is a denormalised per-(product, warehouse) twin of
  // product.stock_quantity. The global invariant is preserved:
  //   Σ stock-level.quantity_on_hand across warehouses === product.stock_quantity
  // (both count InStock, non-archived units). recomputeProductStock still owns
  // the global cache untouched; these methods maintain the per-warehouse split.
  //
  // The auto-maintained rows are warehouse-level (storage_location & batch NULL).
  // Finer-grained bin/batch rows are a later refinement. Units with no warehouse
  // (not yet placed) are excluded from stock-level but still counted globally, so
  // Σ stock-level can be < product.stock_quantity until the backfill places them.
  // ---------------------------------------------------------------------------

  suppressStockLevelRecompute(value = true) {
    _suppressStockLevel = !!value;
  },

  isStockLevelRecomputeSuppressed() {
    return _suppressStockLevel;
  },

  /**
   * Rebuild the warehouse-level stock-level rows for one product from live
   * stock-item rows. Idempotent. Returns the number of rows written.
   */
  async recomputeStockLevelsForProduct(productId) {
    if (!productId) return 0;

    // Work at documentId granularity, not per product-edition-id: a stock-item
    // (not draft/published itself) is linked to BOTH the draft and the published
    // edition of its product, so counting per edition would double it. Count each
    // item once (by documentId, deduped) and keep exactly one warehouse-level
    // stock-level row per (document, warehouse).
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
      populate: { warehouse: { select: ['id'] } },
    });
    // Dedupe by item id — the doc-level join can surface an item once per linked edition.
    const byItem = new Map();
    for (const it of items || []) if (!byItem.has(it.id)) byItem.set(it.id, it);

    const onHand = new Map();   // warehouseId -> count of InStock units
    const reserved = new Map(); // warehouseId -> count of Reserved units
    for (const it of byItem.values()) {
      const whId = it.warehouse?.id;
      if (!whId) continue; // unplaced units aren't bucketed into a stock-level
      if (it.status === 'InStock') onHand.set(whId, (onHand.get(whId) || 0) + 1);
      else if (it.status === 'Reserved') reserved.set(whId, (reserved.get(whId) || 0) + 1);
    }

    // Existing warehouse-level rows (storage_location & batch NULL) for this
    // document — keep one per warehouse, delete duplicates a prior per-edition
    // pass may have created.
    const existingRows = await strapi.db.query(STOCK_LEVEL_UID).findMany({
      where: scopeWhere,
      select: ['id'],
      populate: {
        warehouse: { select: ['id'] },
        storage_location: { select: ['id'] },
        batch: { select: ['id'] },
      },
    });
    const keptByWh = new Map();
    const dupIds = [];
    for (const row of existingRows || []) {
      if (row.storage_location?.id || row.batch?.id) continue; // only warehouse-level rows
      const w = row.warehouse?.id;
      if (!w) { dupIds.push(row.id); continue; }
      if (keptByWh.has(w)) dupIds.push(row.id);
      else keptByWh.set(w, row.id);
    }
    for (const id of dupIds) {
      try { await strapi.db.query(STOCK_LEVEL_UID).delete({ where: { id } }); } catch (_) { /* noop */ }
    }

    const warehouseIds = new Set([
      ...onHand.keys(),
      ...reserved.keys(),
      ...keptByWh.keys(),
    ]);

    let written = 0;
    for (const whId of warehouseIds) {
      const oh = onHand.get(whId) || 0;
      const rv = reserved.get(whId) || 0;
      const data = {
        quantity_on_hand: oh,
        quantity_reserved: rv,
        quantity_available: oh,
      };
      const rowId = keptByWh.get(whId);
      if (rowId) {
        await strapi.db.query(STOCK_LEVEL_UID).update({ where: { id: rowId }, data });
        written += 1;
      } else if (oh > 0 || rv > 0) {
        await strapi.db.query(STOCK_LEVEL_UID).create({
          data: { product: canonicalPid, warehouse: whId, ...data },
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
   *   1. Ensure every branch has a default warehouse + receiving location.
   *   2. Place every stock-item that lacks a warehouse into its branch's
   *      defaults (branch-less / stray items go to a fallback warehouse).
   *   3. Rebuild the stock-level cache.
   *
   * Placement is set-based SQL against the relation join tables (one INSERT…
   * SELECT per branch + a catch-all), so a 30k+ item table backfills in
   * seconds. If the join-table shape can't be resolved from metadata (or the
   * bulk SQL throws), it falls back to a correct-but-slow per-row ORM loop.
   * Only touches items that lack a warehouse, so re-running is safe.
   */
  async backfillDefaultLocations() {
    const started = Date.now();
    let warehousesCreated = 0;
    let locationsCreated = 0;
    let itemsPlaced = 0;
    let mode = 'bulk';

    const branchDefaults = new Map(); // branchId -> { whId, locId }
    let fallback = null;

    // --- 1. Ensure a default warehouse + receiving location per branch (ORM; small N).
    const ensureReceiving = async (whId) => {
      let loc = await strapi.db.query(STORAGE_LOCATION_UID).findOne({
        where: { warehouse: whId, is_receivable: true },
        select: ['id'],
      });
      if (!loc) {
        loc = await strapi.db.query(STORAGE_LOCATION_UID).create({
          data: {
            code: 'RECV', name: 'Receiving', type: 'staging',
            is_receivable: true, is_pickable: true, is_active: true, warehouse: whId,
          },
        });
        locationsCreated += 1;
      }
      return loc.id;
    };

    const branches = await strapi.db.query(BRANCH_UID).findMany({ select: ['id', 'name'] });
    for (const b of (branches || [])) {
      let wh = await strapi.db.query(WAREHOUSE_UID).findOne({
        where: { branch: b.id, is_default: true }, select: ['id'],
      });
      if (!wh) {
        wh = await strapi.db.query(WAREHOUSE_UID).create({
          data: {
            code: `WH-${b.id}`, name: `${b.name || 'Branch ' + b.id} Warehouse`,
            type: 'warehouse', is_default: true, is_active: true, branch: b.id,
          },
        });
        warehousesCreated += 1;
      }
      const locId = await ensureReceiving(wh.id);
      branchDefaults.set(b.id, { whId: wh.id, locId });
      if (!fallback) fallback = { whId: wh.id, locId };
    }

    if (!fallback) {
      const wh = await strapi.db.query(WAREHOUSE_UID).create({
        data: { code: 'WH-DEFAULT', name: 'Main Warehouse', type: 'warehouse', is_default: true, is_active: true },
      });
      warehousesCreated += 1;
      const locId = await ensureReceiving(wh.id);
      fallback = { whId: wh.id, locId };
    }

    // --- 2. Placement.
    const knex = strapi.db.connection;
    let stockTable = null;
    try { stockTable = strapi.db.metadata.get(STOCK_ITEM_UID).tableName; } catch (_) { /* noop */ }
    const whJt = this._relJoinInfo(STOCK_ITEM_UID, 'warehouse');
    const locJt = this._relJoinInfo(STOCK_ITEM_UID, 'storage_location');
    const brJt = this._relJoinInfo(STOCK_ITEM_UID, 'branch');
    const canBulk = !!(knex && stockTable
      && whJt?.table && whJt.itemCol && whJt.targetCol
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
            where: { warehouse: null }, select: ['id'],
            populate: { branch: { select: ['id'] } }, limit: PAGE,
          });
          if (!batch || batch.length === 0) break;
          for (const it of batch) {
            const bId = it.branch?.id;
            const def = (bId && branchDefaults.get(bId)) || fallback;
            await strapi.db.query(STOCK_ITEM_UID).update({
              where: { id: it.id },
              data: { warehouse: def.whId, storage_location: def.locId },
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
        // Insert links for items of a given branch that aren't already linked.
        const placeBranch = async (link, targetId, branchId) => {
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

        for (const [branchId, def] of branchDefaults) {
          itemsPlaced += await placeBranch(whJt, def.whId, branchId);
          await placeBranch(locJt, def.locId, branchId);
        }
        itemsPlaced += await placeRemaining(whJt, fallback.whId);
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
      warehousesCreated,
      locationsCreated,
      itemsPlaced,
      levelsWritten: levels.levelsWritten,
      productsProcessed: levels.processed,
      durationMs: Date.now() - started,
    };
  },
}));
