'use strict';

/**
 * mfg-material-lot service.
 *
 * Bulk-material invariant — the quantity-based twin of the stock-item count
 * invariant (see api::stock-item.stock-item service):
 *
 *   lot.quantity_remaining === lot.quantity_received - SUM(net consumed across
 *                              this lot's mfg-material-issue rows)
 *
 * where net consumed per issue row is:
 *   Issue    → + quantity   (consumes stock)
 *   Wastage  → + quantity   (consumes stock)
 *   Return   → - quantity   (returns stock)
 *   Adjustment → - quantity (signed correction; positive adds stock back)
 *
 * `quantity_remaining` is a denormalised running balance. `recomputeLotRemaining`
 * rebuilds it from the immutable issue ledger so it is always derivable and never
 * drifts — exactly the pattern stock-item uses for product.stock_quantity.
 *
 * Status is auto-managed ONLY across the three quantity-derived states
 * (Available / PartiallyConsumed / Consumed). Manual states (Reserved, Returned,
 * Scrapped, Quarantined) are left untouched by recompute — staff own those.
 */

const { createCoreService } = require('@strapi/strapi').factories;

const LOT_UID = 'api::mfg-material-lot.mfg-material-lot';
const ISSUE_UID = 'api::mfg-material-issue.mfg-material-issue';

const AUTO_STATUSES = new Set(['Available', 'PartiallyConsumed', 'Consumed']);

function netConsumed(issue) {
  const q = Number(issue.quantity) || 0;
  switch (issue.issue_type) {
    case 'Return':
    case 'Adjustment':
      return -q;
    case 'Issue':
    case 'Wastage':
    default:
      return q;
  }
}

module.exports = createCoreService(LOT_UID, ({ strapi }) => ({
  /**
   * Recompute one lot's remaining balance + derived status from its issue ledger.
   * Idempotent. Returns the new remaining quantity (or null if the lot is gone).
   */
  async recomputeLotRemaining(lotId) {
    if (!lotId) return null;

    const lot = await strapi.db.query(LOT_UID).findOne({
      where: { id: lotId },
      select: ['id', 'documentId', 'quantity_received', 'status'],
    });
    if (!lot) return null;

    const issues = await strapi.db.query(ISSUE_UID).findMany({
      where: { material_lot: lotId },
      select: ['id', 'quantity', 'issue_type'],
      limit: -1,
    });

    const consumed = (issues || []).reduce((sum, i) => sum + netConsumed(i), 0);
    const received = Number(lot.quantity_received) || 0;
    const remaining = received - consumed;

    let status = lot.status;
    if (AUTO_STATUSES.has(lot.status)) {
      if (remaining <= 0) status = 'Consumed';
      else if (remaining < received) status = 'PartiallyConsumed';
      else status = 'Available';
    }

    const data = { quantity_remaining: remaining, status };

    // Patch every edition sharing this documentId so any twins stay in lockstep
    // (mirrors stock-item.recomputeProductStock).
    if (lot.documentId) {
      await strapi.db.query(LOT_UID).updateMany({
        where: { documentId: lot.documentId },
        data,
      });
    } else {
      await strapi.db.query(LOT_UID).update({ where: { id: lotId }, data });
    }

    return remaining;
  },

  /**
   * Recompute many lots. Dedupes ids and walks serially. Returns id → remaining.
   */
  async recomputeLotsRemaining(lotIds) {
    const unique = Array.from(new Set((lotIds || []).filter(Boolean)));
    const results = {};
    for (const id of unique) {
      try {
        results[id] = await this.recomputeLotRemaining(id);
      } catch (err) {
        strapi.log.warn(`[mfg-material-lot] recompute lot=${id} failed: ${err.message}`);
        results[id] = null;
      }
    }
    return results;
  },

  /**
   * Job — recompute remaining for every lot in the DB. Idempotent.
   * For post-migration backfill / drift reconciliation. Returns a summary.
   */
  async recomputeAllLots() {
    const started = Date.now();
    const rows = await strapi.db.query(LOT_UID).findMany({
      select: ['id', 'documentId', 'quantity_remaining'],
      limit: -1,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return { processed: 0, corrected: 0, durationMs: Date.now() - started };
    }

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
    for (const lot of targets) {
      try {
        const remaining = await this.recomputeLotRemaining(lot.id);
        processed += 1;
        const prev = Number(lot.quantity_remaining) || 0;
        if (remaining != null && remaining !== prev) corrected += 1;
      } catch (err) {
        errors.push({ lotId: lot.id, message: err.message });
        strapi.log.warn(`[mfg-material-lot] recomputeAllLots lot=${lot.id} failed: ${err.message}`);
      }
    }

    return { processed, corrected, errors, durationMs: Date.now() - started };
  },
}));
