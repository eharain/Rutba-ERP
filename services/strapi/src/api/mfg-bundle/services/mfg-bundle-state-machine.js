'use strict';

/**
 * Bundle State Machine Service.
 *
 * A bundle is the WIP traceability unit (a tied bundle of cut pieces) that moves
 * through operations. The bundle is the single source of work-order YIELD: when a
 * bundle Completes, its finished/rejected garment counts roll up to the parent
 * work order. (Per-task completion only drives payroll + operation progress, so
 * garments aren't re-counted at every operation.)
 *
 * Side effects by target status:
 *   Completed → set quantity_completed/quantity_rejected, roll both up to the WO,
 *               emit BUNDLE_COMPLETED.
 *   Rejected/Scrapped → roll the lost quantity to the WO's quantity_rejected.
 */

const BUNDLE_UID = 'api::mfg-bundle.mfg-bundle';
const WO_UID = 'api::mfg-work-order.mfg-work-order';

const TRANSITIONS = {
  Created: ['Issued', 'Scrapped'],
  Issued: ['InProgress', 'Scrapped'],
  InProgress: ['QCHold', 'Completed', 'Rejected', 'Scrapped'],
  QCHold: ['InProgress', 'Completed', 'Rejected'],
  Completed: [],
  Rejected: [],
  Scrapped: [],
};

function emitMfgEvent(type, payload = {}) {
  try { strapi.eventHub?.emit?.(`mfg.${type}`, payload); } catch (_) { /* no-op */ }
  try { strapi.log.info(`[mfg-event] ${type} ${JSON.stringify(payload)}`); } catch (_) { /* no-op */ }
}

module.exports = {
  validateTransition(from, to) {
    const allowed = TRANSITIONS[from];
    if (!allowed) return false;
    return allowed.includes(to);
  },

  getAllowedTransitions(currentStatus) {
    return TRANSITIONS[currentStatus] || [];
  },

  /**
   * Add finished/rejected garment counts onto a work order. Best-effort read+write.
   */
  async rollUpToWorkOrder(workOrderDocumentId, addCompleted = 0, addRejected = 0) {
    if (!workOrderDocumentId) return;
    try {
      const wo = await strapi.documents(WO_UID).findOne({
        documentId: workOrderDocumentId,
        fields: ['id', 'quantity_completed', 'quantity_rejected'],
      });
      if (!wo) return;
      await strapi.documents(WO_UID).update({
        documentId: workOrderDocumentId,
        data: {
          quantity_completed: (Number(wo.quantity_completed) || 0) + (Number(addCompleted) || 0),
          quantity_rejected: (Number(wo.quantity_rejected) || 0) + (Number(addRejected) || 0),
        },
      });
    } catch (err) {
      strapi.log.warn(`[bundle-state-machine] WO rollup ${workOrderDocumentId} failed: ${err.message}`);
    }
  },

  /**
   * Execute a status transition on a bundle. Throws on an illegal move.
   *
   * @param {string} bundleDocumentId
   * @param {string} newStatus
   * @param {object} [extra] - `extra.quantity_completed` / `extra.quantity_rejected`
   *                           override the yield rolled to the WO.
   */
  async executeTransition(bundleDocumentId, newStatus, extra = {}) {
    const bundle = await strapi.documents(BUNDLE_UID).findOne({
      documentId: bundleDocumentId,
      populate: { work_order: { fields: ['id', 'documentId'] } },
    });
    if (!bundle) throw new Error(`Bundle ${bundleDocumentId} not found`);

    const currentStatus = bundle.status || 'Created';
    if (!this.validateTransition(currentStatus, newStatus)) {
      const err = new Error(`Invalid status transition: ${currentStatus} → ${newStatus}`);
      err.status = 400;
      throw err;
    }

    const { quantity_completed, quantity_rejected, ...restExtra } = extra || {};
    const updateData = { status: newStatus, ...restExtra };

    const qty = Number(bundle.quantity) || 0;
    const alreadyRejected = Number(bundle.quantity_rejected) || 0;

    let rollCompleted = 0;
    let rollRejected = 0;

    if (newStatus === 'Completed') {
      const completed = quantity_completed != null
        ? Math.max(0, Math.floor(Number(quantity_completed) || 0))
        : Math.max(0, qty - alreadyRejected);
      const rejected = quantity_rejected != null
        ? Math.max(0, Math.floor(Number(quantity_rejected) || 0))
        : alreadyRejected;
      updateData.quantity_completed = completed;
      updateData.quantity_rejected = rejected;
      rollCompleted = completed;
      rollRejected = rejected;
    } else if (['Rejected', 'Scrapped'].includes(newStatus)) {
      const rejected = quantity_rejected != null
        ? Math.max(0, Math.floor(Number(quantity_rejected) || 0))
        : Math.max(0, qty - (Number(bundle.quantity_completed) || 0));
      updateData.quantity_rejected = rejected;
      rollRejected = rejected;
    }

    const updated = await strapi.documents(BUNDLE_UID).update({
      documentId: bundleDocumentId,
      data: updateData,
    });

    if (rollCompleted || rollRejected) {
      await this.rollUpToWorkOrder(bundle.work_order?.documentId, rollCompleted, rollRejected);
    }

    if (newStatus === 'Completed') {
      emitMfgEvent('BUNDLE_COMPLETED', {
        bundleDocumentId,
        bundle_code: bundle.bundle_code,
        completed: rollCompleted,
      });
    }

    return updated;
  },
};
