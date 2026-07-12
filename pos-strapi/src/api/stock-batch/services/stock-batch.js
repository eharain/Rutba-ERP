'use strict';

/**
 * stock-batch service — owns the BULK stock invariant, the quantity analog of
 * the serialized one in api::stock-item:
 *
 *   product.bulk_quantity_on_hand === Σ(stock-batch.quantity_remaining
 *                                       WHERE product=X AND status='Active')
 *
 * `bulk_quantity_on_hand` is a denormalised cache the stock-batch lifecycle keeps
 * in sync via recomputeProductBulkQuantity. The product content-type knows nothing
 * about it — treat product.bulk_quantity_on_hand as a fast read of this sum, and
 * reconcile via recomputeAllProductsBulk / POST /stock-batches/recompute-product-bulk
 * if it's ever suspected of drifting. Mirrors api::stock-item.recomputeProductStock
 * (COUNT of InStock units) — this is the SUM of remaining bulk quantity.
 */

const { createCoreService } = require('@strapi/strapi').factories;

const BATCH_UID = 'api::stock-batch.stock-batch';
const PRODUCT_UID = 'api::product.product';

// Only these batch statuses count as on-hand; Expired/Quarantined/Depleted/Recalled don't.
const ACTIVE_BATCH_STATUSES = ['Active'];

module.exports = createCoreService(BATCH_UID, ({ strapi }) => ({
  /**
   * Recompute product.bulk_quantity_on_hand from the live sum of remaining
   * quantity across the product's Active batches. Writes every edition
   * (draft + published) via documentId. Returns the computed sum.
   */
  async recomputeProductBulkQuantity(productId) {
    if (!productId) return null;

    const batches = await strapi.db.query(BATCH_UID).findMany({
      where: { product: productId, status: { $in: ACTIVE_BATCH_STATUSES } },
      select: ['quantity_remaining'],
    });
    const sum = batches.reduce((s, b) => s + (Number(b.quantity_remaining) || 0), 0);

    const row = await strapi.db.query(PRODUCT_UID).findOne({
      where: { id: productId },
      select: ['id', 'documentId'],
    });
    if (!row) return sum;

    if (row.documentId) {
      await strapi.db.query(PRODUCT_UID).updateMany({
        where: { documentId: row.documentId },
        data: { bulk_quantity_on_hand: sum },
      });
    } else {
      await strapi.db.query(PRODUCT_UID).update({
        where: { id: productId },
        data: { bulk_quantity_on_hand: sum },
      });
    }
    return sum;
  },

  /**
   * Flip every Active batch already past its expiry_date to status 'Expired'.
   * The stock-batch lifecycle then drops it from product.bulk_quantity_on_hand
   * (Expired is not an on-hand status). Idempotent; returns the count flipped.
   * The bulk analog of stock-item's expired-unit sweep.
   */
  async sweepExpiredBatches(asOfDate) {
    const t = asOfDate || require('../../../utils/local-date').localDateISO();
    const batches = await strapi.db.query(BATCH_UID).findMany({
      where: { status: 'Active', expiry_date: { $notNull: true, $lt: t } },
      select: ['id'],
      limit: 100000,
    });
    let expired = 0;
    for (const b of batches) {
      try {
        await strapi.entityService.update(BATCH_UID, b.id, { data: { status: 'Expired' } });
        expired += 1;
      } catch (err) {
        strapi.log.warn(`[stock-batch] sweepExpiredBatches batch=${b.id} failed: ${err.message}`);
      }
    }
    if (expired > 0) strapi.log.info(`[stock-batch] sweep-expired flipped ${expired} batch(es) past ${t}`);
    return expired;
  },

  /**
   * Recompute several products' bulk on-hand. Dedups ids, walks serially.
   */
  async recomputeProductsBulkQuantity(productIds) {
    const unique = Array.from(new Set((productIds || []).filter(Boolean)));
    const results = {};
    for (const pid of unique) {
      try {
        results[pid] = await this.recomputeProductBulkQuantity(pid);
      } catch (err) {
        strapi.log.warn(`[stock-batch] recompute product=${pid} failed: ${err.message}`);
        results[pid] = null;
      }
    }
    return results;
  },

  /**
   * Job — recompute bulk_quantity_on_hand for every product. Idempotent;
   * for post-migration backfill or drift reconciliation. Products with no
   * batches settle to 0 (correct — serialized products carry no bulk stock).
   */
  async recomputeAllProductsBulk() {
    const started = Date.now();
    const rows = await strapi.db.query(PRODUCT_UID).findMany({
      select: ['id', 'documentId', 'bulk_quantity_on_hand'],
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return { processed: 0, corrected: 0, durationMs: Date.now() - started };
    }

    // One logical product per documentId (recompute writes every edition).
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
    for (const product of targets) {
      try {
        const prev = Number(product.bulk_quantity_on_hand) || 0;
        const next = await this.recomputeProductBulkQuantity(product.id);
        processed += 1;
        if (Number(next) !== prev) corrected += 1;
      } catch (err) {
        strapi.log.warn(`[stock-batch] recomputeAllProductsBulk product=${product.id} failed: ${err.message}`);
      }
    }
    return { processed, corrected, durationMs: Date.now() - started };
  },
}));
