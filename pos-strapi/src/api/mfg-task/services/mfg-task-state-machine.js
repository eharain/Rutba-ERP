'use strict';

/**
 * Task State Machine Service — the core of worker output + piece-rate payroll.
 *
 * A task is one worker doing one operation on a work order / bundle.
 *
 * Side effects by target status:
 *   Completed → resolve the piece rate, SNAPSHOT piece_rate + amount permanently
 *               (rates are immutable history — never recomputed after this),
 *               stamp completed_at, advance the bundle's operation pointer,
 *               emit TASK_COMPLETED.
 *   Approved  → stamp approved_at; the task is now payroll-eligible (the payroll
 *               run sweeps status=Approved AND payroll_locked=false). emit TASK_APPROVED.
 *   Rejected  → zero the amount contribution, record quantity_rejected for the
 *               worker's defect KPI. emit TASK_REJECTED.
 *
 * Work-order yield (quantity_completed / quantity_rejected) is rolled up from
 * BUNDLE completion, not per-task — otherwise every operation on a bundle would
 * re-count the same garments.
 */

const TASK_UID = 'api::mfg-task.mfg-task';
const PIECE_RATE_UID = 'api::mfg-piece-rate.mfg-piece-rate';
const BUNDLE_UID = 'api::mfg-bundle.mfg-bundle';

const TRANSITIONS = {
  Assigned: ['InProgress', 'Cancelled'],
  InProgress: ['Completed', 'Cancelled'],
  Completed: ['Approved', 'Reworked', 'Rejected'],
  Reworked: ['InProgress', 'Completed'],
  Approved: [],
  Rejected: [],
  Cancelled: [],
};

function emitMfgEvent(type, payload = {}) {
  try { strapi.eventHub?.emit?.(`mfg.${type}`, payload); } catch (_) { /* no-op */ }
  try { strapi.log.info(`[mfg-event] ${type} ${JSON.stringify(payload)}`); } catch (_) { /* no-op */ }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function inEffectiveWindow(rate, day) {
  if (rate.effective_from && rate.effective_from > day) return false;
  if (rate.effective_to && rate.effective_to < day) return false;
  return true;
}

function inQtyBand(rate, qty) {
  const min = Number(rate.min_qty) || 0;
  if (qty < min) return false;
  if (rate.max_qty != null && qty > Number(rate.max_qty)) return false;
  return true;
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
   * Resolve the applicable piece rate for a task.
   *
   * Priority:
   *   1. The worker's own per-operation rate_override (skill_grades component).
   *   2. The most specific active mfg-piece-rate row matching
   *      operation → product (specific beats global null) → skill_grade
   *      (specific beats 'any') → effective window → qty band.
   *
   * @returns {{ rate: number, grade: string|null, cardId: number|null }}
   */
  async resolvePieceRate({ operationId, productId, skillGrade, qty, worker }) {
    // 1. Worker per-operation override wins.
    const grades = Array.isArray(worker?.skill_grades) ? worker.skill_grades : [];
    const override = grades.find(
      (g) => g?.operation?.id === operationId && g?.rate_override != null
    );
    if (override) {
      return { rate: Number(override.rate_override) || 0, grade: override.grade || skillGrade || null, cardId: null };
    }

    if (!operationId) return { rate: 0, grade: skillGrade || null, cardId: null };

    const candidates = await strapi.db.query(PIECE_RATE_UID).findMany({
      where: { operation: operationId, is_active: true },
      populate: { product: { select: ['id'] } },
      limit: -1,
    });

    const day = today();
    const q = Number(qty) || 0;
    const scored = (candidates || [])
      .filter((r) => {
        const prodOk = r.product == null || r.product?.id === productId;
        const gradeOk = !r.skill_grade || r.skill_grade === 'any' || r.skill_grade === skillGrade;
        return prodOk && gradeOk && inEffectiveWindow(r, day) && inQtyBand(r, q);
      })
      .map((r) => {
        let score = 0;
        if (r.product?.id === productId) score += 4;          // product-specific
        if (r.skill_grade && r.skill_grade === skillGrade) score += 2; // grade-specific
        score += (Number(r.min_qty) || 0) / 1e6;              // narrower tier wins ties
        return { r, score, eff: r.effective_from || '' };
      })
      .sort((a, b) => (b.score - a.score) || (b.eff > a.eff ? 1 : -1));

    if (scored.length === 0) return { rate: 0, grade: skillGrade || null, cardId: null };
    const best = scored[0].r;
    return { rate: Number(best.rate) || 0, grade: skillGrade || null, cardId: best.id };
  },

  /**
   * Advance a bundle's operation pointer as a task completes on it. Best-effort.
   */
  async advanceBundle(bundle, operation) {
    if (!bundle?.documentId) return;
    try {
      const data = {};
      if (operation?.documentId) data.current_operation = operation.documentId;
      if (operation?.sequence_hint != null) data.current_operation_seq = operation.sequence_hint;
      if (['Created', 'Issued'].includes(bundle.status)) data.status = 'InProgress';
      if (Object.keys(data).length) {
        await strapi.documents(BUNDLE_UID).update({ documentId: bundle.documentId, data });
      }
    } catch (err) {
      strapi.log.warn(`[task-state-machine] advanceBundle bundle=${bundle.documentId} failed: ${err.message}`);
    }
  },

  /**
   * Execute a status transition on a task. Throws on an illegal move.
   *
   * @param {string} taskDocumentId
   * @param {string} newStatus
   * @param {object} [extra] - extra fields; `extra.quantity_completed` /
   *                           `extra.quantity_rejected` override the qty captured.
   */
  async executeTransition(taskDocumentId, newStatus, extra = {}) {
    const task = await strapi.documents(TASK_UID).findOne({
      documentId: taskDocumentId,
      populate: {
        operation: { fields: ['id', 'documentId', 'sequence_hint'] },
        bundle: { fields: ['id', 'documentId', 'status'] },
        work_order: { populate: { product: { fields: ['id'] } } },
        worker: {
          fields: ['id', 'documentId', 'default_skill_grade'],
          populate: { skill_grades: { populate: { operation: { fields: ['id'] } } } },
        },
      },
    });
    if (!task) throw new Error(`Task ${taskDocumentId} not found`);

    const currentStatus = task.status || 'Assigned';
    if (!this.validateTransition(currentStatus, newStatus)) {
      const err = new Error(`Invalid status transition: ${currentStatus} → ${newStatus}`);
      err.status = 400;
      throw err;
    }

    const { quantity_completed, quantity_rejected, ...restExtra } = extra || {};
    const updateData = { status: newStatus, ...restExtra };

    if (newStatus === 'InProgress' && !task.started_at && !restExtra.started_at) {
      updateData.started_at = new Date();
    }

    if (newStatus === 'Completed') {
      const qty = quantity_completed != null
        ? Math.max(0, Math.floor(Number(quantity_completed) || 0))
        : (Number(task.quantity_completed) || Number(task.quantity_assigned) || 0);

      const skillGrade = task.skill_grade || task.worker?.default_skill_grade || null;
      const { rate, grade, cardId } = await this.resolvePieceRate({
        operationId: task.operation?.id,
        productId: task.work_order?.product?.id,
        skillGrade,
        qty,
        worker: task.worker,
      });

      updateData.quantity_completed = qty;
      updateData.skill_grade = grade || skillGrade || null;
      updateData.piece_rate = rate;
      updateData.amount = qty * rate;
      if (!task.completed_at && !restExtra.completed_at) updateData.completed_at = new Date();
      if (cardId) updateData.piece_rate_card = cardId;
    }

    if (newStatus === 'Approved' && !task.approved_at && !restExtra.approved_at) {
      updateData.approved_at = new Date();
    }

    if (newStatus === 'Rejected') {
      updateData.amount = 0;
      updateData.quantity_rejected = quantity_rejected != null
        ? Math.max(0, Math.floor(Number(quantity_rejected) || 0))
        : (Number(task.quantity_completed) || Number(task.quantity_assigned) || 0);
    }

    const updated = await strapi.documents(TASK_UID).update({
      documentId: taskDocumentId,
      data: updateData,
    });

    // Side effects after the row lands.
    if (newStatus === 'Completed') {
      await this.advanceBundle(task.bundle, task.operation);
      emitMfgEvent('TASK_COMPLETED', {
        taskDocumentId,
        worker: task.worker?.documentId,
        amount: updateData.amount,
      });
    } else if (newStatus === 'Approved') {
      emitMfgEvent('TASK_APPROVED', { taskDocumentId, worker: task.worker?.documentId, amount: task.amount });
    } else if (newStatus === 'Rejected') {
      emitMfgEvent('TASK_REJECTED', { taskDocumentId, worker: task.worker?.documentId });
    }

    return updated;
  },
};
