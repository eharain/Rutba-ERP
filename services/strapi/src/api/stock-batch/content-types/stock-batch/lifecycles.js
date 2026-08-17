'use strict';

/**
 * stock-batch lifecycle — keeps product.bulk_quantity_on_hand in sync.
 *
 * Any batch write (create/update/delete) recomputes the affected product's bulk
 * on-hand from the full batch ledger via api::stock-batch.recomputeProductBulkQuantity
 * — so the cache is always derivable and never drifts, even when a batch's
 * quantity_remaining or status changes, or its product is reassigned. Best-effort:
 * a recompute failure is logged, never blocks the batch write (the reconcile
 * endpoint can always rebuild it). recompute writes to the PRODUCT, not the batch,
 * so it never re-triggers this lifecycle.
 *
 * Mirrors api::mfg-material-issue (which recomputes lot balances) and the
 * stock-item lifecycle (which recomputes product.stock_quantity).
 */

const BATCH_UID = 'api::stock-batch.stock-batch';
const BATCH_SVC = 'api::stock-batch.stock-batch';

async function productIdOfBatch(batchId) {
  if (!batchId) return null;
  const row = await strapi.db.query(BATCH_UID).findOne({
    where: { id: batchId },
    populate: { product: { select: ['id'] } },
  });
  return row?.product?.id || null;
}

async function recompute(productIds) {
  const ids = Array.from(new Set((productIds || []).filter(Boolean)));
  if (ids.length === 0) return;
  try {
    await strapi.service(BATCH_SVC).recomputeProductsBulkQuantity(ids);
  } catch (err) {
    strapi.log.warn(`[stock-batch] bulk on-hand recompute failed: ${err.message}`);
  }
}

module.exports = {
  async afterCreate(event) {
    await recompute([await productIdOfBatch(event.result?.id)]);
  },

  async beforeUpdate(event) {
    const id = event.params?.where?.id;
    if (!id) return;
    event.state = event.state || {};
    event.state.oldProductId = await productIdOfBatch(id);
  },

  async afterUpdate(event) {
    const newProductId = await productIdOfBatch(event.result?.id);
    await recompute([event.state?.oldProductId, newProductId]);
  },

  async beforeDelete(event) {
    const id = event.params?.where?.id;
    if (!id) return;
    event.state = event.state || {};
    event.state.deletedProductId = await productIdOfBatch(id);
  },

  async afterDelete(event) {
    await recompute([event.state?.deletedProductId]);
  },
};
