'use strict';

/**
 * Return-Request State Machine
 *
 * Mirrors sale-order-state-machine.js. Owns the stock-item side effects that
 * close the reverse-logistics loop:
 *   - RECEIVED → walk return_request.items[].stock_item:
 *       restock_decision = back_to_inventory → Sold → InStock
 *       restock_decision = damaged_writeoff  → Sold → ReturnedDamaged
 *
 * MVP transitions are conservative — no AWAITING_PICKUP fork yet because
 * we don't have a courier-pickup integration (Phase F.LOGISTICS). Staff
 * can record the parcel arriving via setReceived directly.
 *
 * Side effects on COMPLETED are intentionally minimal: the controller
 * stamps the refund_status + dispatches the customer notification.
 */

const RETURN_REQUEST_UID = 'api::return-request.return-request';
const STOCK_ITEM_UID     = 'api::stock-item.stock-item';
const SALE_ORDER_UID     = 'api::sale-order.sale-order';

const TRANSITIONS = {
    REQUESTED:        ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED:         ['AWAITING_PICKUP', 'RECEIVED', 'CANCELLED'],
    AWAITING_PICKUP:  ['RECEIVED', 'CANCELLED'],
    RECEIVED:         ['COMPLETED'],
    COMPLETED:        [],
    REJECTED:         [],
    CANCELLED:        [],
};

// Mirror map: when the return's status flips, push the parent order through
// the matching detour state so the order's lifecycle visualisation stays
// honest. The order's own state machine validates the transition — if the
// order isn't in a compatible state (e.g. someone cancelled it manually mid
// return), we log and move on rather than failing the return transition.
const ORDER_MIRROR = {
    REQUESTED:       'RETURN_REQUESTED',
    APPROVED:        'RETURN_IN_TRANSIT',
    AWAITING_PICKUP: 'RETURN_IN_TRANSIT',
    RECEIVED:        'RETURNED',
    COMPLETED:       'REFUND_INITIATED',
};

// restock_decision on the return-line → target stock-item status.
// Anything not in this map is a no-op (line wasn't unit-tracked).
const STOCK_TRANSITIONS_ON_RESTOCK_DECISION = {
    back_to_inventory: 'InStock',
    damaged_writeoff:  'ReturnedDamaged',
};

module.exports = {
    validateTransition(from, to) {
        const allowed = TRANSITIONS[from];
        if (!allowed) return false;
        return allowed.includes(to);
    },

    /**
     * Execute a status transition on a return-request.
     * Throws on invalid transition.
     *
     * @param {string} returnDocumentId
     * @param {string} newStatus
     * @param {object} [extra]  - additional fields to update (approved_by,
     *                            received_by, received_at, refund_status, …)
     * @returns {Promise<object>} Updated return-request
     */
    async executeTransition(returnDocumentId, newStatus, extra = {}) {
        const current = await strapi.documents(RETURN_REQUEST_UID).findOne({
            documentId: returnDocumentId,
            fields: ['id', 'status'],
        });
        if (!current) {
            const err = new Error(`Return request ${returnDocumentId} not found`);
            err.status = 404;
            throw err;
        }

        const fromStatus = current.status || 'REQUESTED';
        if (!this.validateTransition(fromStatus, newStatus)) {
            const err = new Error(`Invalid return-request transition: ${fromStatus} → ${newStatus}`);
            err.status = 400;
            throw err;
        }

        const updateData = { status: newStatus, ...extra };

        // Auto-stamp received_at on RECEIVED — controller can override by
        // passing it in extra (e.g. backdating a paper trail).
        if (newStatus === 'RECEIVED' && !extra.received_at) {
            updateData.received_at = new Date();
        }
        if (newStatus === 'CANCELLED' && !extra.cancelled_at) {
            updateData.cancelled_at = new Date();
        }

        const updated = await strapi.documents(RETURN_REQUEST_UID).update({
            documentId: returnDocumentId,
            data: updateData,
        });

        // Stock-item walk on RECEIVED. Best-effort like the sale-order
        // side effects — a failure logs but does not unwind the transition.
        if (newStatus === 'RECEIVED') {
            try {
                await this.walkRestockDecisions(returnDocumentId);
            } catch (err) {
                strapi.log.warn(
                    `[return-state-machine] stock walk failed for return=${returnDocumentId}: ${err.message}`,
                );
            }
        }

        // Mirror onto the parent order's state machine so the order-management
        // shell renders the right stage. Best-effort: the order may have been
        // cancelled or manually adjusted, in which case the transition is
        // invalid and we just log + move on. The return itself still succeeded.
        await this.mirrorOntoOrder(returnDocumentId, newStatus);

        return updated;
    },

    /**
     * Push the order through its corresponding return-detour state when the
     * return-request's status changes. Skipped if there is no mirror mapping
     * (e.g. REJECTED — see ORDER_MIRROR), or if the order is no longer in a
     * state that accepts the target.
     *
     * Two cases need special handling:
     *   - REJECTED / CANCELLED from REQUESTED → walk the order back to
     *     DELIVERED so staff can re-open with a fresh return-request.
     *   - COMPLETED with refund_status='completed' → also bump REFUND_INITIATED
     *     → REFUNDED in one shot.
     */
    async mirrorOntoOrder(returnDocumentId, newStatus) {
        const orderStateMachine = require('../../sale-order/services/sale-order-state-machine');
        const ret = await strapi.documents(RETURN_REQUEST_UID).findOne({
            documentId: returnDocumentId,
            populate: { sale_order: { fields: ['documentId', 'order_status'] } },
            fields: ['refund_status'],
        });
        const orderDocId = ret?.sale_order?.documentId;
        if (!orderDocId) return;

        const target = ORDER_MIRROR[newStatus];

        // Rejection / cancellation from REQUESTED walks the order back to
        // DELIVERED so it isn't stuck in the return chain.
        const rewindToDelivered = (newStatus === 'REJECTED' || newStatus === 'CANCELLED')
            && ret.sale_order.order_status === 'RETURN_REQUESTED';

        try {
            if (rewindToDelivered) {
                await orderStateMachine.executeTransition(orderDocId, 'DELIVERED', {});
            } else if (target) {
                await orderStateMachine.executeTransition(orderDocId, target, {});
                // Completed-with-refund-paid: bump straight to REFUNDED so the
                // order's terminal state matches reality. The refund chain
                // (REFUND_INITIATED → REFUNDED) stays valid in the order's
                // own state machine for manual progressions on the
                // cancellation path.
                if (newStatus === 'COMPLETED' && ret.refund_status === 'completed') {
                    await orderStateMachine.executeTransition(orderDocId, 'REFUNDED', {});
                }
            }
        } catch (err) {
            strapi.log.info(
                `[return-state-machine] order mirror skipped for return=${returnDocumentId}: ${err.message}`,
            );
        }
    },

    /**
     * Walk this return's line items and transition each attached stock-item
     * Sold → (InStock | ReturnedDamaged) per its restock_decision.
     *
     * Lines without an attached stock-item are silently skipped (line was
     * a non-serialised item, or warehouse never bound a unit). Lines whose
     * stock-item isn't currently Sold are also skipped — could mean the
     * order was cancelled before delivery (unit went Reserved → InStock),
     * or an admin already corrected the unit manually.
     */
    async walkRestockDecisions(returnDocumentId) {
        const ret = await strapi.documents(RETURN_REQUEST_UID).findOne({
            documentId: returnDocumentId,
            populate: {
                items: {
                    populate: { stock_item: { fields: ['documentId', 'status'] } },
                },
            },
        });
        if (!ret) return { transitioned: 0, skipped: 0 };

        let transitioned = 0;
        let skipped      = 0;

        for (const line of ret.items || []) {
            const si = line.stock_item;
            if (!si?.documentId) continue;
            const target = STOCK_TRANSITIONS_ON_RESTOCK_DECISION[line.restock_decision];
            if (!target) {
                skipped++;
                continue;
            }
            if (si.status !== 'Sold') {
                strapi.log.info(
                    `[return-state-machine] return=${returnDocumentId} skip stock_item=${si.documentId} (status=${si.status}, expected=Sold)`,
                );
                skipped++;
                continue;
            }
            try {
                await strapi.documents(STOCK_ITEM_UID).update({
                    documentId: si.documentId,
                    data: { status: target },
                });
                transitioned++;
            } catch (err) {
                strapi.log.warn(
                    `[return-state-machine] return=${returnDocumentId} stock_item=${si.documentId} Sold→${target} failed: ${err.message}`,
                );
                skipped++;
            }
        }

        return { transitioned, skipped };
    },

    getAllowedTransitions(currentStatus) {
        return TRANSITIONS[currentStatus] || [];
    },
};
