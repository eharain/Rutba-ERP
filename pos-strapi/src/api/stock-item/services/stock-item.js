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
}));
