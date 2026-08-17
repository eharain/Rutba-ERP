'use strict';

/**
 * HR Leave Request state machine.
 *
 * Mirrors the manufacturing / sale-order state machines: a single
 * executeTransition chokepoint that validates the move (against a definable
 * workflow when one exists for this entity, else a hardcoded fallback) and owns
 * every side effect, so controllers never scatter the decision logic.
 *
 * Canonical statuses: Pending → Approved | Rejected | Cancelled.
 * An Approved request may still be Cancelled (plans change); Rejected is
 * terminal. Side effects stay keyed to the canonical status and only fire when
 * it actually changes — so a future definable workflow with extra review stages
 * never double-fires notifications.
 */

const LR_UID = 'api::hr-leave-request.hr-leave-request';
const workflowEngine = require('../../../utils/workflow-engine');

const TRANSITIONS = {
  Pending: ['Approved', 'Rejected', 'Cancelled'],
  Approved: ['Cancelled'],
  Rejected: [],
  Cancelled: [],
};

function emitHrEvent(type, payload = {}) {
  try { strapi.eventHub?.emit?.(`hr.${type}`, payload); } catch (_) { /* no-op */ }
  try { strapi.log.info(`[hr-event] ${type} ${JSON.stringify(payload)}`); } catch (_) { /* no-op */ }
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
   * Execute a transition on a leave request. Throws on an illegal move.
   *
   * @param {string} documentId
   * @param {string} target  canonical status (Approved|Rejected|Cancelled) or,
   *                          when a workflow is defined, a stage key.
   * @param {object} [extra] { userDocumentId, reason } — decision metadata.
   */
  async executeTransition(documentId, target, extra = {}) {
    const lr = await strapi.documents(LR_UID).findOne({
      documentId,
      populate: { employee: { fields: ['id', 'documentId', 'name'] } },
    });
    if (!lr) {
      const err = new Error(`Leave request ${documentId} not found`);
      err.status = 404;
      throw err;
    }

    const currentStatus = lr.status || 'Pending';
    let newStatus = target;
    let stageKey = null;

    const wf = await workflowEngine.getWorkflowFor(LR_UID);
    if (wf) {
      const fromStage = workflowEngine.currentStage(wf, lr, 'status');
      const toStage = workflowEngine.resolveTargetStage(wf, target);
      if (!toStage) {
        const err = new Error(`Unknown workflow stage or status: ${target}`);
        err.status = 400;
        throw err;
      }
      if (fromStage && !workflowEngine.validateTransition(wf, fromStage.key, toStage.key)) {
        const err = new Error(`Invalid stage transition: ${fromStage.key} → ${toStage.key}`);
        err.status = 400;
        throw err;
      }
      newStatus = toStage.maps_to_status || currentStatus;
      stageKey = toStage.key;
    } else if (!this.validateTransition(currentStatus, newStatus)) {
      const err = new Error(`Invalid status transition: ${currentStatus} → ${newStatus}`);
      err.status = 400;
      throw err;
    }

    const statusChanged = newStatus !== currentStatus;
    const { userDocumentId, reason, ...restExtra } = extra || {};
    const updateData = { status: newStatus, ...restExtra };
    if (stageKey) updateData.stage_key = stageKey;

    if (statusChanged && (newStatus === 'Approved' || newStatus === 'Rejected')) {
      updateData.decided_at = new Date();
      // v5 document API connects relations by documentId (cf. mfg-work-order).
      if (userDocumentId) updateData.decided_by = userDocumentId;
      if (newStatus === 'Rejected' && reason) updateData.rejection_reason = reason;
    }

    const updated = await strapi.documents(LR_UID).update({
      documentId,
      data: updateData,
      populate: { employee: { fields: ['id', 'documentId', 'name'] } },
    });

    // Side effects — keyed to the canonical status, only when it changed.
    if (statusChanged) {
      emitHrEvent(`LEAVE_${newStatus.toUpperCase()}`, {
        leaveRequestDocumentId: documentId,
        employee: lr.employee?.documentId || null,
        leave_type: lr.leave_type,
        total_days: updated.total_days ?? lr.total_days ?? null,
      });
    }

    return updated;
  },
};
