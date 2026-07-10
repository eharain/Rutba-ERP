'use strict';

/**
 * stock-item lifecycle.
 *
 * Two jobs, both deliberately kept on the stock-item side so the product
 * module stays free of stock concerns:
 *
 *   1. Append a status_history component entry whenever `status` changes.
 *   2. Keep `product.stock_quantity` in sync — it's a denormalised cache of
 *      count(stock-items in InStock). See ./services/stock-item.js for the
 *      invariant. Every create/update that affects status, product relation,
 *      or archived flag — and every delete — triggers a recompute on the
 *      affected product(s). Variant transfers (product relation changing)
 *      recompute both old and new product.
 *
 * `_updating` guards against the recursive afterUpdate the status_history
 * write-back triggers — both history and recompute are skipped when set.
 */

const STOCK_ITEM_UID = 'api::stock-item.stock-item';
const PRODUCT_UID = 'api::product.product';
const STOCK_BATCH_UID = 'api::stock-batch.stock-batch';

// Normalise however a relation arrives on a create payload → { id } | { documentId }.
function relId(v) {
  if (v == null) return null;
  if (typeof v === 'number') return { id: v };
  if (typeof v === 'string') return { documentId: v };
  if (Array.isArray(v)) return v.length ? relId(v[0]) : null;
  if (typeof v === 'object') {
    if (v.id != null) return { id: v.id };
    if (v.documentId != null) return { documentId: v.documentId };
    if (v.connect != null) return relId(v.connect);
    if (v.set != null) return relId(v.set);
  }
  return null;
}

async function fetchRow(uid, ref, fields) {
  if (!ref) return null;
  const where = ref.id != null ? { id: ref.id } : { documentId: ref.documentId };
  return strapi.db.query(uid).findOne({ where, select: fields });
}

// Guard against the recursive afterUpdate triggered by the status_history
// write-back. While true, both the history append and the recompute are
// skipped — the row mutation in question is a synthetic one we issued.
let _updating = false;

async function loadCurrentState(itemId) {
  return strapi.db.query(STOCK_ITEM_UID).findOne({
    where: { id: itemId },
    select: ['id', 'status', 'cost_price', 'selling_price', 'archived'],
    populate: { product: { select: ['id'] } },
  });
}

async function loadProductId(itemId) {
  const fresh = await strapi.db.query(STOCK_ITEM_UID).findOne({
    where: { id: itemId },
    populate: { product: { select: ['id'] } },
  });
  return fresh?.product?.id || null;
}

async function recompute(productIds) {
  const ids = Array.from(new Set((productIds || []).filter(Boolean)));
  if (ids.length === 0) return;
  const svc = strapi.service(STOCK_ITEM_UID);
  for (const pid of ids) {
    try {
      await svc.recomputeProductStock(pid);
    } catch (err) {
      strapi.log.warn(`[stock-item] recompute product=${pid} failed: ${err.message}`);
    }
    // Divisible-stock cache (Σ remaining sub-units of InStock items). Best-effort
    // and independent of stock_quantity above — a failure here must not break it.
    try {
      await svc.recomputeSellableQuantity(pid);
    } catch (err) {
      strapi.log.warn(`[stock-item] sellable_quantity recompute product=${pid} failed: ${err.message}`);
    }
  }
}

// Per-location stock-level cache (Foundation F2). Kept strictly best-effort and
// separate from the global recompute above: a failure here must NEVER break the
// stock-item mutation or the product.stock_quantity invariant. Skipped while the
// backfill suppresses it (it does one full rebuild at the end instead).
async function recomputeStockLevels(productIds) {
  const ids = Array.from(new Set((productIds || []).filter(Boolean)));
  if (ids.length === 0) return;
  const svc = strapi.service(STOCK_ITEM_UID);
  if (typeof svc.isStockLevelRecomputeSuppressed === 'function' && svc.isStockLevelRecomputeSuppressed()) {
    return;
  }
  for (const pid of ids) {
    try {
      await svc.recomputeStockLevelsForProduct(pid);
    } catch (err) {
      strapi.log.warn(`[stock-item] stock-level recompute product=${pid} failed: ${err.message}`);
    }
  }
}

module.exports = {
  // Auto-fill a unit's expiry_date at intake (Epic 5) when the caller didn't set
  // one — the per-unit expiry_date stays authoritative. Order of precedence:
  //   explicit data.expiry_date  >  the assigned batch's expiry_date  >
  //   the product's shelf life (is_perishable + shelf_life_days → received + N days).
  // Covers every create path (bulk import, generate, scan, WO finished goods)
  // from one chokepoint. Best-effort: a lookup failure never blocks the create.
  async beforeCreate(event) {
    const { data } = event.params;
    if (!data || data.expiry_date != null) return;

    if (data.batch != null) {
      try {
        const batch = await fetchRow(STOCK_BATCH_UID, relId(data.batch), ['id', 'expiry_date']);
        if (batch?.expiry_date) { data.expiry_date = batch.expiry_date; return; }
      } catch (_) { /* noop */ }
    }

    if (data.product != null) {
      try {
        const product = await fetchRow(PRODUCT_UID, relId(data.product), ['id', 'is_perishable', 'shelf_life_days']);
        const days = Number(product?.shelf_life_days);
        if (product?.is_perishable && Number.isFinite(days) && days > 0) {
          const exp = new Date();
          exp.setDate(exp.getDate() + days);
          data.expiry_date = exp.toISOString().slice(0, 10);
        }
      } catch (_) { /* noop */ }
    }
  },

  async beforeUpdate(event) {
    if (_updating) return;

    const { data, where } = event.params;
    const itemId = where?.id;
    if (!itemId) return;

    const wantsStatus = Object.prototype.hasOwnProperty.call(data || {}, 'status');
    const wantsProduct = Object.prototype.hasOwnProperty.call(data || {}, 'product');
    const wantsArchived = Object.prototype.hasOwnProperty.call(data || {}, 'archived');
    const wantsWarehouse = Object.prototype.hasOwnProperty.call(data || {}, 'warehouse');
    const wantsLocation = Object.prototype.hasOwnProperty.call(data || {}, 'storage_location');
    // Divisible stock: a change to remaining sub-units (units_sold) or capacity
    // (sellable_units) must recompute product.sellable_quantity even when status
    // doesn't change (a portion sale leaves the item InStock).
    const wantsUnits = Object.prototype.hasOwnProperty.call(data || {}, 'units_sold')
      || Object.prototype.hasOwnProperty.call(data || {}, 'sellable_units');
    if (!wantsStatus && !wantsProduct && !wantsArchived && !wantsWarehouse && !wantsLocation && !wantsUnits) return;

    const existing = await loadCurrentState(itemId);
    if (!existing) return;

    const newStatus = wantsStatus ? data.status : existing.status;
    const newArchived = wantsArchived ? data.archived : existing.archived;
    const statusChanged = wantsStatus && newStatus !== existing.status;
    const archivedChanged = wantsArchived && newArchived !== existing.archived;

    event.state = event.state || {};
    event.state.oldProductId = existing.product?.id || null;
    event.state.productRelTouched = wantsProduct;
    // Global product.stock_quantity depends on status / product / archived only —
    // NOT on which warehouse the unit sits in. `wantsUnits` is included so a
    // portion sale (units_sold change, status unchanged) still refreshes the
    // divisible sellable_quantity cache (recomputing the unchanged count is cheap).
    event.state.recomputeNeeded = statusChanged || wantsProduct || archivedChanged || wantsUnits;
    // The per-warehouse stock-level cache additionally cares about warehouse /
    // location moves (the unit changes buckets without changing the global count).
    event.state.stockLevelNeeded =
      statusChanged || wantsProduct || archivedChanged || wantsWarehouse || wantsLocation;

    if (statusChanged) {
      event.state.statusChanged = true;
      event.state.newStatus = newStatus;
      event.state.costPrice = data.cost_price ?? existing.cost_price ?? null;
      event.state.sellingPrice = data.selling_price ?? existing.selling_price ?? null;
    }
  },

  async afterUpdate(event) {
    if (_updating) return;

    const { result } = event;
    const itemId = result?.id;
    if (!itemId) return;

    // 1. Status history append (only when status actually changed)
    if (event.state?.statusChanged) {
      const { newStatus, costPrice, sellingPrice } = event.state;

      const existing = await strapi.entityService.findOne(
        STOCK_ITEM_UID,
        itemId,
        { populate: { status_history: true } }
      );

      const history = Array.isArray(existing?.status_history)
        ? existing.status_history.map(({ id, ...rest }) => rest)
        : [];

      history.push({
        status: newStatus,
        cost_price: costPrice,
        selling_price: sellingPrice,
        createdAt: new Date().toISOString().split('T')[0],
      });

      _updating = true;
      try {
        await strapi.entityService.update(
          STOCK_ITEM_UID,
          itemId,
          { data: { status_history: history } }
        );
      } finally {
        _updating = false;
      }
    }

    // 2. Stock cache recompute (status, product, archived, warehouse, or location changed)
    if (event.state?.recomputeNeeded || event.state?.stockLevelNeeded) {
      const affected = [event.state.oldProductId];
      if (event.state.productRelTouched) {
        // The new product id isn't easily readable off `result` because
        // relations aren't populated there — re-read.
        affected.push(await loadProductId(itemId));
      }
      if (event.state?.recomputeNeeded) {
        await recompute(affected);
      }
      if (event.state?.stockLevelNeeded) {
        await recomputeStockLevels(affected);
      }
    }
  },

  async afterCreate(event) {
    if (_updating) return;

    const { result } = event;
    const itemId = result?.id;
    if (!itemId) return;

    // 1. Seed status_history with the initial status
    const status = result.status;
    if (status) {
      _updating = true;
      try {
        await strapi.entityService.update(
          STOCK_ITEM_UID,
          itemId,
          {
            data: {
              status_history: [{
                status,
                cost_price: result.cost_price ?? null,
                selling_price: result.selling_price ?? null,
                createdAt: new Date().toISOString().split('T')[0],
              }],
            },
          }
        );
      } finally {
        _updating = false;
      }
    }

    // 2. Recompute the parent product's caches (global + per-warehouse)
    const pid = await loadProductId(itemId);
    if (pid) {
      await recompute([pid]);
      await recomputeStockLevels([pid]);
    }
  },

  async beforeDelete(event) {
    const { where } = event.params;
    const itemId = where?.id;
    if (!itemId) return;
    try {
      const existing = await strapi.db.query(STOCK_ITEM_UID).findOne({
        where: { id: itemId },
        populate: { product: { select: ['id'] } },
      });
      event.state = event.state || {};
      event.state.deletedProductId = existing?.product?.id || null;
    } catch (_) {
      // ignore — recompute will simply be skipped
    }
  },

  async afterDelete(event) {
    const pid = event.state?.deletedProductId;
    if (!pid) return;
    await recompute([pid]);
    await recomputeStockLevels([pid]);
  },
};
