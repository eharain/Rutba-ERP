'use strict';

/**
 * Work Order State Machine Service.
 *
 * Mirrors the sale-order state machine: a single executeTransition chokepoint
 * that validates the move and owns every side effect, so controllers never
 * scatter business logic.
 *
 * Side effects by target status:
 *   Released   → stamp; emit WO_RELEASED. NO hard material reservation
 *                (consumption-first model — lot.quantity_reserved stays advisory).
 *   InProgress → stamp started_at; emit.
 *   Completed  → (a) roll up costing (material from the issue ledger, labour from
 *                approved/completed task amounts, overhead from overhead_rate),
 *                (b) create the finished garments as stock-items (status InStock)
 *                so the existing stock-item lifecycle lifts product.stock_quantity,
 *                emit WO_COMPLETED.
 *   Cancelled  → emit WO_CANCELLED.
 */

const WO_UID = 'api::mfg-work-order.mfg-work-order';
const TASK_UID = 'api::mfg-task.mfg-task';
const ISSUE_UID = 'api::mfg-material-issue.mfg-material-issue';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';

const workflowEngine = require('../../../utils/workflow-engine');

const TRANSITIONS = {
  Draft: ['Released', 'Cancelled'],
  Released: ['InProgress', 'OnHold', 'Cancelled'],
  InProgress: ['Completed', 'OnHold', 'Cancelled'],
  OnHold: ['InProgress', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

function emitMfgEvent(type, payload = {}) {
  try { strapi.eventHub?.emit?.(`mfg.${type}`, payload); } catch (_) { /* no-op */ }
  try { strapi.log.info(`[mfg-event] ${type} ${JSON.stringify(payload)}`); } catch (_) { /* no-op */ }
}

function signedCost(issue) {
  const c = Number(issue.total_cost) || 0;
  return ['Return', 'Adjustment'].includes(issue.issue_type) ? -c : c;
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
   * Compute the costing roll-up for a work order from its ledgers. Pure read.
   * Returns { material_cost, labor_cost, overhead_cost, total_cost, cost_per_unit }.
   */
  async computeCosting(workOrder) {
    const woId = workOrder.id;

    const issues = await strapi.db.query(ISSUE_UID).findMany({
      where: { work_order: woId },
      select: ['id', 'total_cost', 'issue_type'],
      limit: -1,
    });
    const material_cost = (issues || []).reduce((s, i) => s + signedCost(i), 0);

    const tasks = await strapi.db.query(TASK_UID).findMany({
      where: { work_order: woId, status: { $in: ['Completed', 'Approved'] } },
      select: ['id', 'amount'],
      limit: -1,
    });
    const labor_cost = (tasks || []).reduce((s, t) => s + (Number(t.amount) || 0), 0);

    const overheadRate = Number(workOrder.overhead_rate) || 0;
    const overhead_cost = (material_cost + labor_cost) * overheadRate;
    const total_cost = material_cost + labor_cost + overhead_cost;

    const qty = Number(workOrder.quantity_completed) > 0
      ? Number(workOrder.quantity_completed)
      : Number(workOrder.quantity_ordered) || 0;
    const cost_per_unit = qty > 0 ? total_cost / qty : 0;

    return {
      material_cost,
      labor_cost,
      overhead_cost,
      total_cost,
      cost_per_unit,
    };
  },

  /**
   * Create N finished-garment stock-items (status InStock) for a completed WO.
   * Goes through the documents API so the stock-item lifecycle fires and
   * recomputes product.stock_quantity. Idempotent: skips if the WO already has
   * finished stock-items attached.
   */
  async createFinishedStockItems(workOrder, count, costPerUnit) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n === 0) return { created: 0 };

    const existing = await strapi.db.query(STOCK_ITEM_UID).count({
      where: { work_order: workOrder.id },
    });
    if (existing > 0) {
      strapi.log.info(`[wo-state-machine] WO=${workOrder.documentId} already has ${existing} finished items — skipping creation`);
      return { created: 0, skipped: existing };
    }

    const product = workOrder.product;
    const branch = workOrder.branch;
    let created = 0;
    for (let i = 0; i < n; i++) {
      try {
        await strapi.documents(STOCK_ITEM_UID).create({
          data: {
            name: product?.name || workOrder.name || null,
            sku: product?.sku || null,
            status: 'InStock',
            sellable_units: 1,
            cost_price: costPerUnit ?? null,
            selling_price: product?.selling_price ?? null,
            ...(product?.documentId ? { product: product.documentId } : {}),
            ...(branch?.documentId ? { branch: branch.documentId } : {}),
            work_order: workOrder.documentId,
          },
        });
        created++;
      } catch (err) {
        strapi.log.warn(`[wo-state-machine] WO=${workOrder.documentId} stock-item create failed: ${err.message}`);
      }
    }
    return { created };
  },

  /**
   * Execute a transition on a work order. Throws on an illegal move.
   *
   * `target` is either a canonical status (legacy) or, when a definable
   * workflow exists for work orders, a workflow stage key. With a workflow
   * the move is validated against the defined transition graph and the
   * canonical status is derived from the target stage's `maps_to_status` —
   * side effects below stay keyed to the canonical status and only run when
   * it actually changes (a stage move within the same status is metadata).
   *
   * @param {string} workOrderDocumentId
   * @param {string} target
   * @param {object} [extra] - extra fields to set; `extra.quantity_finished`
   *                           overrides how many stock-items Completed creates.
   */
  async executeTransition(workOrderDocumentId, target, extra = {}) {
    const wo = await strapi.documents(WO_UID).findOne({
      documentId: workOrderDocumentId,
      populate: {
        product: { fields: ['id', 'documentId', 'name', 'sku', 'selling_price'] },
        branch: { fields: ['id', 'documentId'] },
      },
    });
    if (!wo) throw new Error(`Work order ${workOrderDocumentId} not found`);

    const currentStatus = wo.status || 'Draft';
    let newStatus = target;
    let stageKey = null;

    const wf = await workflowEngine.getWorkflowFor(WO_UID);
    if (wf) {
      const fromStage = workflowEngine.currentStage(wf, wo, 'status');
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
    const { quantity_finished, ...restExtra } = extra || {};
    const updateData = { status: newStatus, ...restExtra };
    if (stageKey) updateData.stage_key = stageKey;

    if (statusChanged && newStatus === 'InProgress' && !wo.started_at && !restExtra.started_at) {
      updateData.started_at = new Date();
    }

    let finishedCount = 0;
    if (statusChanged && newStatus === 'Completed') {
      if (!wo.completed_at && !restExtra.completed_at) updateData.completed_at = new Date();
      const costing = await this.computeCosting(wo);
      Object.assign(updateData, costing);

      const qtyCompleted = Number(wo.quantity_completed) || 0;
      const qtyOrdered = Number(wo.quantity_ordered) || 0;
      const qtyRejected = Number(wo.quantity_rejected) || 0;
      finishedCount = quantity_finished != null
        ? Math.max(0, Math.floor(Number(quantity_finished) || 0))
        : (qtyCompleted > 0 ? qtyCompleted : Math.max(0, qtyOrdered - qtyRejected));
      updateData._costPerUnit = costing.cost_per_unit; // transient, stripped below
    }

    const costPerUnit = updateData._costPerUnit;
    delete updateData._costPerUnit;

    const updated = await strapi.documents(WO_UID).update({
      documentId: workOrderDocumentId,
      data: updateData,
    });

    // Side effects after the WO row lands — keyed to the CANONICAL status and
    // only when it changed; a stage move within the same status is metadata.
    if (statusChanged && newStatus === 'Released') {
      emitMfgEvent('WO_RELEASED', { workOrderDocumentId, wo_number: wo.wo_number });
    } else if (statusChanged && newStatus === 'Completed') {
      try {
        const res = await this.createFinishedStockItems(wo, finishedCount, costPerUnit);
        strapi.log.info(`[wo-state-machine] WO=${workOrderDocumentId} created ${res.created} finished stock-items`);
      } catch (err) {
        strapi.log.warn(`[wo-state-machine] WO=${workOrderDocumentId} finished-goods creation failed: ${err.message}`);
      }
      emitMfgEvent('WO_COMPLETED', {
        workOrderDocumentId,
        wo_number: wo.wo_number,
        finished: finishedCount,
      });
    } else if (statusChanged && newStatus === 'Cancelled') {
      emitMfgEvent('WO_CANCELLED', { workOrderDocumentId, wo_number: wo.wo_number });
    } else if (!statusChanged && stageKey) {
      emitMfgEvent('WO_STAGE_CHANGED', { workOrderDocumentId, wo_number: wo.wo_number, stage: stageKey });
    }

    return updated;
  },
};
