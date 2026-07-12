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
const LOT_UID = 'api::mfg-material-lot.mfg-material-lot';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';
const STOCK_BATCH_UID = 'api::stock-batch.stock-batch';

const workflowEngine = require('../../../utils/workflow-engine');
const { logActivity } = require('../../../utils/work-item-activity');

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
    });
    const material_cost = (issues || []).reduce((s, i) => s + signedCost(i), 0);

    const tasks = await strapi.db.query(TASK_UID).findMany({
      where: { work_order: woId, status: { $in: ['Completed', 'Approved'] } },
      select: ['id', 'amount'],
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
   * Has this WO already produced output? True if it has finished stock-items OR
   * finished stock-batches — the idempotency guard for both output ledgers, so a
   * re-completion never double-produces.
   */
  async _woHasProduced(workOrder) {
    const items = await strapi.db.query(STOCK_ITEM_UID).count({ where: { work_order: workOrder.id } });
    if (items > 0) return items;
    const batches = await strapi.db.query(STOCK_BATCH_UID).count({ where: { work_order: workOrder.id } });
    return batches;
  },

  /**
   * Receive one output product into the correct ledger (Epic 1 P4 / Foundation F5
   * track_mode activation):
   *   serialized → N InStock stock-items (the stock-item lifecycle lifts
   *                product.stock_quantity), as before.
   *   bulk       → ONE stock-batch carrying the quantity (the stock-batch
   *                lifecycle lifts product.bulk_quantity_on_hand).
   * Does NOT check idempotency — callers guard once via _woHasProduced.
   */
  async receiveOutput(workOrder, product, count, unitCost, trackMode) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n === 0) return { created: 0, mode: trackMode };

    if (trackMode === 'bulk') {
      try {
        await strapi.documents(STOCK_BATCH_UID).create({
          data: {
            batch_code: `WO-${workOrder.wo_number || workOrder.documentId}-${product?.sku || product?.documentId || 'out'}`,
            status: 'Active',
            received_at: new Date(),
            unit_cost: unitCost ?? null,
            quantity_received: n,
            quantity_remaining: n,
            ...(product?.documentId ? { product: product.documentId } : {}),
            ...(workOrder.documentId ? { work_order: workOrder.documentId } : {}),
          },
        });
        return { created: n, mode: 'bulk' };
      } catch (err) {
        strapi.log.warn(`[wo-state-machine] WO=${workOrder.documentId} stock-batch create failed: ${err.message}`);
        return { created: 0, mode: 'bulk' };
      }
    }

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
            cost_price: unitCost ?? null,
            selling_price: product?.selling_price ?? null,
            ...(product?.documentId ? { product: product.documentId } : {}),
            ...(branch?.documentId ? { branch: branch.documentId } : {}),
            work_order: workOrder.documentId,
          },
        });
        created += 1;
      } catch (err) {
        strapi.log.warn(`[wo-state-machine] WO=${workOrder.documentId} stock-item create failed: ${err.message}`);
      }
    }
    return { created, mode: 'serialized' };
  },

  /**
   * Create finished goods for a single-output WO (no BOM `outputs` declared).
   * Routes wo.product by its track_mode (serialized → stock-items, bulk →
   * stock-batch). Idempotent: skips if the WO already produced.
   */
  async createFinishedStockItems(workOrder, count, costPerUnit) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n === 0) return { created: 0 };

    const existing = await this._woHasProduced(workOrder);
    if (existing > 0) {
      strapi.log.info(`[wo-state-machine] WO=${workOrder.documentId} already produced ${existing} — skipping creation`);
      return { created: 0, skipped: existing };
    }

    const product = workOrder.product;
    const trackMode = product?.track_mode || 'serialized';
    const res = await this.receiveOutput(workOrder, product, n, costPerUnit, trackMode);
    return { created: res.created, mode: res.mode };
  },

  /**
   * Create finished goods for a completed WO — MULTI-OUTPUT aware.
   *
   * If the WO's BOM declares `outputs` (co-products / by-products / scrap), it
   * produces stock-items for EACH output: count scaled by the output's yield
   * (output_quantity / bom.output_quantity) and unit cost = total_cost × the
   * output's cost-share (cost_share_pct normalised across outputs; if no shares
   * are set the primary output absorbs 100%). When the BOM has no `outputs`
   * (the common single-output case) it falls back to createFinishedStockItems —
   * identical behaviour to before. Idempotent (skips if the WO already produced).
   */
  async createFinishedGoods(workOrder, count, costing) {
    const n = Math.max(0, Math.floor(Number(count) || 0));

    // Load the BOM's outputs. Best-effort — a lookup miss falls back to single output.
    let outputs = [];
    let bomOutQty = 1;
    try {
      const woFull = await strapi.documents(WO_UID).findOne({
        documentId: workOrder.documentId,
        populate: {
          bom: {
            populate: {
              outputs: { populate: { product: { fields: ['id', 'documentId', 'name', 'sku', 'selling_price', 'track_mode'] } } },
            },
          },
        },
      });
      const bom = woFull?.bom;
      if (bom) {
        bomOutQty = Number(bom.output_quantity) || 1;
        outputs = Array.isArray(bom.outputs) ? bom.outputs.filter((o) => o?.product) : [];
      }
    } catch (e) {
      strapi.log.warn(`[wo-state-machine] WO=${workOrder.documentId} load BOM outputs failed: ${e.message}`);
    }

    // Backward-compat: no multi-output declared → single primary output (wo.product).
    if (outputs.length === 0) {
      return this.createFinishedStockItems(workOrder, n, costing?.cost_per_unit);
    }

    const existing = await this._woHasProduced(workOrder);
    if (existing > 0) {
      strapi.log.info(`[wo-state-machine] WO=${workOrder.documentId} already produced ${existing} — skipping`);
      return { created: 0, skipped: existing };
    }

    const totalCost = Number(costing?.total_cost) || 0;
    const totalShare = outputs.reduce((s, o) => s + (Number(o.cost_share_pct) || 0), 0);
    let primaryIdx = outputs.findIndex((o) => o.output_type === 'primary');
    if (primaryIdx < 0) primaryIdx = 0;

    let created = 0;
    const perOutput = [];
    for (let idx = 0; idx < outputs.length; idx++) {
      const out = outputs[idx];
      const product = out.product;
      const outCount = Math.max(0, Math.round((n * (Number(out.output_quantity) || 1)) / bomOutQty));
      const effShare = totalShare > 0
        ? (Number(out.cost_share_pct) || 0) / totalShare
        : (idx === primaryIdx ? 1 : 0);
      const outUnitCost = outCount > 0 ? (totalCost * effShare) / outCount : 0;
      // Route by the output's explicit override, else the product's track_mode.
      const trackMode = out.track_mode_override || product?.track_mode || 'serialized';

      const res = await this.receiveOutput(workOrder, product, outCount, outUnitCost, trackMode);
      created += res.created;
      perOutput.push({ product: product?.documentId, type: out.output_type, count: outCount, unitCost: outUnitCost, mode: res.mode });
    }

    strapi.log.info(`[wo-state-machine] WO=${workOrder.documentId} multi-output produced ${created} across ${outputs.length} output(s)`);
    return { created, perOutput };
  },

  /**
   * Auto-consume the BOM's material inputs when a WO completes (Epic 1 P2).
   *
   * For each BOM material line, required qty = quantity × (1 + wastage_pct/100)
   * × (finishedCount / bom.output_quantity), routed by the input product's
   * track_mode:
   *   bulk       → consume from mfg-material-lot(s) FEFO (expiry, then received),
   *                creating mfg-material-issue 'Issue' rows (the issue lifecycle
   *                recomputes lot.quantity_remaining).
   *   serialized → flip that many InStock stock-items to 'Reduced'.
   *
   * Best-effort (never blocks completion) and guarded: SKIPS entirely if the WO
   * already has material issues (the manual consumption flow was used) so it can
   * never double-consume, and does nothing when the BOM has no material lines.
   * Shortfalls are logged, not fatal.
   */
  async autoConsumeInputs(workOrder, finishedCount) {
    let materialLines = [];
    let bomOutQty = 1;
    try {
      const woFull = await strapi.documents(WO_UID).findOne({
        documentId: workOrder.documentId,
        populate: {
          bom: {
            populate: {
              material_lines: { populate: { material_product: { fields: ['id', 'documentId', 'name', 'track_mode', 'unit_of_measure'] } } },
            },
          },
        },
      });
      const bom = woFull?.bom;
      if (bom) {
        bomOutQty = Number(bom.output_quantity) || 1;
        materialLines = Array.isArray(bom.material_lines) ? bom.material_lines.filter((l) => l?.material_product) : [];
      }
    } catch (e) {
      strapi.log.warn(`[wo-state-machine] WO=${workOrder.documentId} load BOM material lines failed: ${e.message}`);
    }
    if (materialLines.length === 0) return { consumed: 0, reason: 'no BOM material lines' };

    // Never double-consume: if the WO already has issues, the manual flow ran.
    const existingIssues = await strapi.db.query(ISSUE_UID).count({ where: { work_order: workOrder.id } });
    if (existingIssues > 0) return { consumed: 0, skipped: true, reason: `WO already has ${existingIssues} issue(s)` };

    const n = Math.max(0, Math.floor(Number(finishedCount) || 0));
    const scale = bomOutQty > 0 ? n / bomOutQty : n;
    const branch = workOrder.branch;
    const results = [];

    for (const line of materialLines) {
      const product = line.material_product;
      const reqQty = (Number(line.quantity) || 0) * (1 + (Number(line.wastage_pct) || 0) / 100) * scale;
      if (!(reqQty > 0)) continue;

      if (product.track_mode === 'serialized') {
        const need = Math.ceil(reqQty);
        const units = await strapi.db.query(STOCK_ITEM_UID).findMany({
          where: { product: product.id, status: 'InStock', $or: [{ archived: false }, { archived: { $null: true } }] },
          select: ['id', 'cost_price'], orderBy: { createdAt: 'asc' }, limit: need,
        });
        let consumed = 0;
        let consumedCost = 0;
        for (const u of units) {
          try {
            await strapi.entityService.update(STOCK_ITEM_UID, u.id, { data: { status: 'Reduced' } });
            consumed += 1;
            consumedCost += Number(u.cost_price) || 0;
          } catch (_) { /* noop */ }
        }
        // Record the consumed serialized units' cost as a lot-less material-issue
        // so it enters WO costing (computeCosting sums every issue's total_cost).
        // Without this, serialized-input cost never reaches the finished goods.
        if (consumed > 0 && consumedCost > 0) {
          try {
            await strapi.entityService.create(ISSUE_UID, {
              data: {
                quantity: consumed,
                uom: product.unit_of_measure || 'piece',
                issue_type: 'Issue',
                unit_cost: consumedCost / consumed,
                total_cost: consumedCost,
                work_order: workOrder.id,
                notes: `Auto-consumed ${consumed} serialized unit(s) of ${product.name || product.documentId}`,
                ...(branch?.id ? { branch: branch.id } : {}),
              },
            });
          } catch (err) {
            strapi.log.warn(`[wo-state-machine] WO=${workOrder.documentId} serialized cost-issue create failed: ${err.message}`);
          }
        }
        results.push({ product: product.documentId, mode: 'serialized', required: need, consumed, short: Math.max(0, need - consumed) });
      } else {
        const lots = await strapi.db.query(LOT_UID).findMany({
          where: {
            product: product.id,
            quantity_remaining: { $gt: 0 },
            status: { $notIn: ['Quarantined', 'Scrapped', 'Returned'] },
          },
          select: ['id', 'quantity_remaining', 'unit_cost', 'uom'],
          orderBy: [{ expiry: 'asc' }, { received_at: 'asc' }, { id: 'asc' }],
          limit: 1000,
        });
        let need = reqQty; let consumed = 0;
        for (const lot of lots) {
          if (need <= 0) break;
          const take = Math.min(Number(lot.quantity_remaining) || 0, need);
          if (!(take > 0)) continue;
          try {
            await strapi.entityService.create(ISSUE_UID, {
              data: {
                quantity: take,
                uom: lot.uom || product.unit_of_measure || 'piece',
                issue_type: 'Issue',
                unit_cost: lot.unit_cost ?? null,
                material_lot: lot.id,
                work_order: workOrder.id,
                ...(branch?.id ? { branch: branch.id } : {}),
              },
            });
            need -= take; consumed += take;
          } catch (err) {
            strapi.log.warn(`[wo-state-machine] WO=${workOrder.documentId} issue create failed: ${err.message}`);
          }
        }
        results.push({ product: product.documentId, mode: 'bulk', required: reqQty, consumed, short: Math.max(0, reqQty - consumed) });
      }
    }

    const shortLines = results.filter((r) => r.short > 0).length;
    strapi.log.info(`[wo-state-machine] WO=${workOrder.documentId} auto-consumed ${results.length} input line(s), ${shortLines} short`);
    return { consumed: results.length, shortLines, results };
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
  async executeTransition(workOrderDocumentId, target, extra = {}, opts = {}) {
    const wo = await strapi.documents(WO_UID).findOne({
      documentId: workOrderDocumentId,
      populate: {
        product: { fields: ['id', 'documentId', 'name', 'sku', 'selling_price', 'track_mode'] },
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
      if (fromStage) {
        if (!workflowEngine.validateTransition(wf, fromStage.key, toStage.key)) {
          const err = new Error(`Invalid stage transition: ${fromStage.key} → ${toStage.key}`);
          err.status = 400;
          throw err;
        }
        // Per-transition role gate (approles). actorRoleLevels omitted = trusted
        // internal call.
        const edge = workflowEngine.findTransition(wf, fromStage.key, toStage.key);
        if (!workflowEngine.transitionAllowsRoles(edge, opts.actorRoleLevels)) {
          const err = new Error(`Your role is not permitted to perform "${edge.label || toStage.key}".`);
          err.status = 403;
          throw err;
        }
      } else if (!this.validateTransition(currentStatus, toStage.maps_to_status || currentStatus)) {
        // Current status maps to no stage (workflow edited mid-flight) — fall
        // back to the canonical graph so the record stays on a safe path
        // instead of allowing an arbitrary jump.
        const err = new Error(`Invalid transition: ${currentStatus} → ${toStage.maps_to_status}`);
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
    // Strip fields the state machine owns so a caller's `extra` can't override
    // the resolved status/stage.
    const { quantity_finished, status: _ignoredStatus, stage_key: _ignoredStage, ...restExtra } = extra || {};
    const updateData = { status: newStatus, ...restExtra };
    if (stageKey) updateData.stage_key = stageKey;

    if (statusChanged && newStatus === 'InProgress' && !wo.started_at && !restExtra.started_at) {
      updateData.started_at = new Date();
    }

    let finishedCount = 0;
    if (statusChanged && newStatus === 'Completed') {
      if (!wo.completed_at && !restExtra.completed_at) updateData.completed_at = new Date();

      const qtyCompleted = Number(wo.quantity_completed) || 0;
      const qtyOrdered = Number(wo.quantity_ordered) || 0;
      const qtyRejected = Number(wo.quantity_rejected) || 0;
      finishedCount = quantity_finished != null
        ? Math.max(0, Math.floor(Number(quantity_finished) || 0))
        : (qtyCompleted > 0 ? qtyCompleted : Math.max(0, qtyOrdered - qtyRejected));

      // Consume the BOM inputs BEFORE costing. In the auto-consume flow there are
      // no pre-existing material issues, so computing costing first would always
      // read material_cost 0 and capitalize the finished goods at labor+overhead
      // only. Best-effort: a consume failure must not block completion (it will
      // correctly leave material_cost 0). Idempotent via its own existing-issues
      // guard, so it runs exactly once here (removed from the side-effects below).
      try {
        const consumed = await this.autoConsumeInputs(wo, finishedCount);
        strapi.log.info(`[wo-state-machine] WO=${workOrderDocumentId} auto-consume: ${JSON.stringify(consumed)}`);
      } catch (err) {
        strapi.log.warn(`[wo-state-machine] WO=${workOrderDocumentId} auto-consume failed: ${err.message}`);
      }

      const costing = await this.computeCosting(wo);
      Object.assign(updateData, costing);
      updateData._costPerUnit = costing.cost_per_unit; // transient, stripped below
      updateData._totalCost = costing.total_cost; // transient, stripped below
    }

    const costPerUnit = updateData._costPerUnit;
    delete updateData._costPerUnit;
    const finishedTotalCost = updateData._totalCost;
    delete updateData._totalCost;

    const updated = await strapi.documents(WO_UID).update({
      documentId: workOrderDocumentId,
      data: updateData,
    });

    // Audit trail (best-effort) — record the move on the generic work-item log.
    if (statusChanged || stageKey) {
      await logActivity(strapi, {
        entityUid: WO_UID,
        documentId: workOrderDocumentId,
        kind: 'transition',
        summary: `${wo.wo_number || 'WO'}: ${currentStatus} → ${stageKey || newStatus}`,
        from: wo.stage_key || currentStatus,
        to: stageKey || newStatus,
        actor: opts.actor,
        data: { from_status: currentStatus, to_status: newStatus, stage_key: stageKey || null },
      });
    }

    // Side effects after the WO row lands — keyed to the CANONICAL status and
    // only when it changed; a stage move within the same status is metadata.
    if (statusChanged && newStatus === 'Released') {
      emitMfgEvent('WO_RELEASED', { workOrderDocumentId, wo_number: wo.wo_number });
    } else if (statusChanged && newStatus === 'Completed') {
      // Inputs were already consumed above (before costing). Now materialise the
      // finished goods at the correctly-costed unit price.
      try {
        const res = await this.createFinishedGoods(wo, finishedCount, { total_cost: finishedTotalCost, cost_per_unit: costPerUnit });
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
