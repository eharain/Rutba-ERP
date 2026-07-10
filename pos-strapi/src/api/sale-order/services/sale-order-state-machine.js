'use strict';

/**
 * Order State Machine Service
 *
 * Defines valid status transitions and executes them safely. Also owns the
 * stock-item state-machine side effects that close the inventory loop:
 *   - CANCELLED → restock (Reserved → InStock)
 *   - DELIVERED → finalise sale (Reserved → Sold)
 * FAILED_DELIVERY deliberately leaves units in Reserved — they stay
 * allocated until staff either retries (back to OUT_FOR_DELIVERY) or
 * cancels (which then restocks via the CANCELLED hook).
 *
 * Return detour (DELIVERED → … → REFUNDED) is driven by the parallel
 * return-request state machine, which calls this service to mirror its
 * own progression onto the order. The order's own RETURNED transition is
 * intentionally a metadata flip — the per-line restock walk lives on
 * return-state-machine.walkRestockDecisions (Sold → InStock or
 * ReturnedDamaged via the return-line's restock_decision). Two stock
 * walks for the same return would race, so this side stays passive.
 */

const SALE_ORDER_UID = 'api::sale-order.sale-order';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';

const workflowEngine = require('../../../utils/workflow-engine');
const { logActivity } = require('../../../utils/work-item-activity');

const TRANSITIONS = {
    PENDING_PAYMENT:    ['PAYMENT_CONFIRMED', 'CANCELLED'],
    PAYMENT_CONFIRMED:  ['PREPARING', 'CANCELLED'],
    PREPARING:          ['AWAITING_PICKUP', 'CANCELLED'],
    AWAITING_PICKUP:    ['OUT_FOR_DELIVERY', 'CANCELLED'],
    OUT_FOR_DELIVERY:   ['DELIVERED', 'FAILED_DELIVERY'],
    FAILED_DELIVERY:    ['OUT_FOR_DELIVERY', 'CANCELLED'],
    DELIVERED:          ['RETURN_REQUESTED'],
    RETURN_REQUESTED:   ['RETURN_IN_TRANSIT', 'DELIVERED'],
    RETURN_IN_TRANSIT:  ['RETURNED', 'DELIVERED'],
    RETURNED:           ['REFUND_INITIATED'],
    CANCELLED:          ['REFUND_INITIATED'],
    REFUND_INITIATED:   ['REFUNDED'],
    REFUNDED:           [],
};

// Map of order-status → { from, to } for attached stock-items.
// Only listed statuses trigger a stock-item walk; everything else is a no-op.
const STOCK_TRANSITIONS_ON_ORDER_STATUS = {
    CANCELLED: { from: 'Reserved', to: 'InStock' },
    DELIVERED: { from: 'Reserved', to: 'Sold' },
};

// Map the sale-order payment_method enum → account-resolver key used to debit
// the cash / clearing account when web-order revenue is recognised on delivery.
// COD lands in a rider-float clearing account until the cash is deposited and
// verified (see record-payment / verify accounting hook).
const ORDER_PAYMENT_METHOD_KEY = {
    cod:            'COD_CLEARING',
    card:           'CARD_CLEARING',
    online_gateway: 'CARD_CLEARING',
    bank_transfer:  'BANK_PRIMARY',
    mobile_wallet:  'MOBILE_WALLET',
};

module.exports = {
    /**
     * Check whether a status transition is valid.
     * @param {string} from
     * @param {string} to
     * @returns {boolean}
     */
    validateTransition(from, to) {
        const allowed = TRANSITIONS[from];
        if (!allowed) return false;
        return allowed.includes(to);
    },

    /**
     * Execute a status transition on an order.
     * Throws if the transition is not allowed.
     *
     * @param {string} orderDocumentId
     * @param {string} newStatus
     * @param {object} [extra]  - additional fields to update (e.g. actual_delivery_time)
     * @returns {Promise<object>} Updated order
     */
    async executeTransition(orderDocumentId, target, extra = {}, opts = {}) {
        const order = await strapi.documents('api::sale-order.sale-order').findOne({
            documentId: orderDocumentId,
            fields: ['id', 'order_status', 'stage_key'],
        });

        if (!order) {
            throw new Error(`Order ${orderDocumentId} not found`);
        }

        const currentStatus = order.order_status || 'PENDING_PAYMENT';
        let newStatus = target;
        let stageKey = null;

        // Definable workflow (api::workflow.workflow): when one exists for
        // sale orders, its transition graph replaces the hardcoded map.
        // `target` may be a stage key or a canonical status name; the stage's
        // maps_to_status decides the canonical status, which keeps owning the
        // stock side effects below.
        const wf = await workflowEngine.getWorkflowFor(SALE_ORDER_UID);
        if (wf) {
            const fromStage = workflowEngine.currentStage(wf, order, 'order_status');
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
                // Per-transition role gate (approles). actorRoleLevels omitted =
                // trusted internal call (return mirror, payment hook, etc.).
                const edge = workflowEngine.findTransition(wf, fromStage.key, toStage.key);
                if (!workflowEngine.transitionAllowsRoles(edge, opts.actorRoleLevels)) {
                    const err = new Error(`Your role is not permitted to perform "${edge.label || toStage.key}".`);
                    err.status = 403;
                    throw err;
                }
            } else if (!this.validateTransition(currentStatus, toStage.maps_to_status || currentStatus)) {
                // Current status maps to no stage (workflow edited mid-flight) —
                // fall back to the canonical graph rather than allow any jump.
                const err = new Error(`Invalid transition: ${currentStatus} → ${toStage.maps_to_status}`);
                err.status = 400;
                throw err;
            }
            newStatus = toStage.maps_to_status || currentStatus;
            stageKey = toStage.key;
        } else if (!this.validateTransition(currentStatus, newStatus)) {
            const err = new Error(
                `Invalid status transition: ${currentStatus} → ${newStatus}`
            );
            err.status = 400;
            throw err;
        }

        const statusChanged = newStatus !== currentStatus;
        // Strip fields the state machine owns so a caller's `extra` can't
        // override the resolved status/stage.
        const { order_status: _ignoredStatus, stage_key: _ignoredStage, ...safeExtra } = extra || {};
        const updateData = { order_status: newStatus, ...safeExtra };
        if (stageKey) updateData.stage_key = stageKey;

        // Auto-set actual_delivery_time when delivered
        if (statusChanged && newStatus === 'DELIVERED' && !extra.actual_delivery_time) {
            updateData.actual_delivery_time = new Date();
        }

        const updated = await strapi.documents(SALE_ORDER_UID).update({
            documentId: orderDocumentId,
            data: updateData,
        });

        // Audit trail (best-effort).
        if (statusChanged || stageKey) {
            await logActivity(strapi, {
                entityUid: SALE_ORDER_UID,
                documentId: orderDocumentId,
                kind: 'transition',
                summary: `${currentStatus} → ${stageKey || newStatus}`,
                from: order.stage_key || currentStatus,
                to: stageKey || newStatus,
                actor: opts.actor,
                data: { from_status: currentStatus, to_status: newStatus, stage_key: stageKey || null },
            });
        }

        // Run attached-stock-item side effects AFTER the order update lands.
        // Best-effort: failures here log a warning but don't unwind the order
        // status change — the stock-item lifecycle hooks already self-heal
        // `product.stock_quantity` on the next recompute job, and an admin
        // can correct an individual unit's status manually if needed.
        // Only when the canonical status actually changed — a custom stage
        // move within the same status must not re-walk stock items.
        const stockMove = statusChanged ? STOCK_TRANSITIONS_ON_ORDER_STATUS[newStatus] : null;
        if (stockMove) {
            try {
                await this.transitionAttachedStockItems(
                    orderDocumentId,
                    stockMove.from,
                    stockMove.to,
                );
            } catch (err) {
                strapi.log.warn(
                    `[order-state-machine] stock-item walk failed for order=${orderDocumentId} on ${newStatus}: ${err.message}`,
                );
            }
        }

        // Divisible lines have no single Reserved stock-item — their sub-units were
        // consumed at allocation time (Divisible P2b). On a restocking status,
        // release those allocations back to stock. Best-effort.
        const DIVISIBLE_RESTOCK_STATUSES = ['CANCELLED', 'RETURNED'];
        if (statusChanged && DIVISIBLE_RESTOCK_STATUSES.includes(newStatus)) {
            try {
                const rel = await strapi.service('api::sale-order.sale-order').releaseDivisibleForOrder(orderDocumentId);
                if (rel?.released) {
                    strapi.log.info(`[order-state-machine] released ${rel.released} divisible allocation(s) for order=${orderDocumentId} on ${newStatus}`);
                }
            } catch (err) {
                strapi.log.warn(`[order-state-machine] divisible release failed for order=${orderDocumentId}: ${err.message}`);
            }
        }

        // Accounting side effects (best-effort; a missing mapping must never
        // unwind the order status change). DELIVERED recognises revenue + COGS;
        // CANCELLED / REFUNDED reverse the order's posted entries.
        if (statusChanged) {
            try {
                await this.postAccountingForStatus(orderDocumentId, newStatus, extra);
            } catch (err) {
                strapi.log.warn(
                    `[order-state-machine] accounting post failed for order=${orderDocumentId} on ${newStatus}: ${err.message}`,
                );
            }
        }

        return updated;
    },

    /**
     * Walk an order's line items, find each attached stock-item currently in
     * `fromStatus`, and transition it to `toStatus`. Used by:
     *   - CANCELLED transition  (Reserved → InStock)  — restock
     *   - DELIVERED transition  (Reserved → Sold)     — finalise sale
     *
     * Lines without an attached stock-item are silently ignored (the order
     * may have been cancelled before warehouse picked, or the line is a
     * non-serialised product). Lines whose stock-item is already past
     * `fromStatus` are also skipped — that's normal when a refund or manual
     * correction moved the unit on; we don't want a stale state-machine
     * call to thrash it backwards.
     *
     * Updates go through the documents API so the stock-item lifecycle
     * hooks fire — they append to status_history and recompute the parent
     * product.stock_quantity cache per the stock model invariant.
     *
     * @param {string} orderDocumentId
     * @param {string} fromStatus  - expected current status (e.g. 'Reserved')
     * @param {string} toStatus    - new status (e.g. 'InStock' | 'Sold')
     * @returns {Promise<{transitioned: number, skipped: number}>}
     */
    async transitionAttachedStockItems(orderDocumentId, fromStatus, toStatus) {
        const order = await strapi.documents(SALE_ORDER_UID).findOne({
            documentId: orderDocumentId,
            populate: {
                products: {
                    populate: {
                        items: {
                            populate: {
                                stock_item: { fields: ['documentId', 'status'] },
                            },
                        },
                    },
                },
            },
        });
        if (!order) return { transitioned: 0, skipped: 0 };

        const lines = order.products?.items || [];
        let transitioned = 0;
        let skipped = 0;

        for (const line of lines) {
            const si = line.stock_item;
            if (!si?.documentId) continue;
            if (si.status !== fromStatus) {
                strapi.log.info(
                    `[order-state-machine] order=${orderDocumentId} skip stock_item=${si.documentId} (status=${si.status}, expected=${fromStatus})`,
                );
                skipped++;
                continue;
            }
            try {
                await strapi.documents(STOCK_ITEM_UID).update({
                    documentId: si.documentId,
                    data: { status: toStatus },
                });
                transitioned++;
            } catch (err) {
                strapi.log.warn(
                    `[order-state-machine] order=${orderDocumentId} stock_item=${si.documentId} ${fromStatus}→${toStatus} failed: ${err.message}`,
                );
                skipped++;
            }
        }

        return { transitioned, skipped };
    },

    getAllowedTransitions(currentStatus) {
        return TRANSITIONS[currentStatus] || [];
    },

    /* ────────────────────────────────────────────────────────────────
     *  Accounting side effects
     *
     *  Mirrors the POS sale pattern (sale/controllers/checkout.js): post
     *  through the accounting engine + account-resolver, key every entry to
     *  source_type 'Web Order' + the order id so it is idempotent (findBySource)
     *  and reversible (reverseBySource). Callers wrap this in try/catch — a
     *  configuration gap (e.g. a missing mapping) logs a warning and is
     *  reconciled later; it never throws a hard failure that unwinds a delivery.
     * ──────────────────────────────────────────────────────────────── */

    async postAccountingForStatus(orderDocumentId, newStatus, extra = {}) {
        const posted_by = extra?.posted_by || '';
        if (newStatus === 'DELIVERED') {
            await this.postOrderRevenueAndCogs(orderDocumentId, posted_by);
        } else if (newStatus === 'CANCELLED' || newStatus === 'REFUNDED') {
            const accounting = strapi.service('api::acc-journal-entry.accounting');
            const order = await strapi.documents(SALE_ORDER_UID).findOne({
                documentId: orderDocumentId,
                fields: ['id'],
            });
            if (order) {
                await accounting.reverseBySource('Web Order', order.id, { posted_by });
                await accounting.reverseBySource('Web Order Payment', order.id, { posted_by });
            }
        }
    },

    /**
     * Recognise revenue (+ shipping) and COGS for a delivered web order.
     * Revenue is recognised on the accrual basis at DELIVERED.
     */
    async postOrderRevenueAndCogs(orderDocumentId, posted_by = '') {
        const accounting = strapi.service('api::acc-journal-entry.accounting');
        const resolver = strapi.service('api::acc-journal-entry.account-resolver');

        const order = await strapi.documents(SALE_ORDER_UID).findOne({
            documentId: orderDocumentId,
            fields: ['id', 'order_id', 'subtotal', 'total', 'payment_method'],
            populate: {
                products: {
                    populate: {
                        items: {
                            populate: { stock_item: { fields: ['cost_price'] } },
                        },
                    },
                },
            },
        });
        if (!order) return;

        // Idempotency: never double-post if an entry already exists for this order.
        const existing = await accounting.findBySource('Web Order', order.id);
        if (existing && existing.length > 0) return;

        // sale-order has no branch relation — resolve mappings globally.
        const branchId = null;
        const total = Number(order.total || 0);
        const subtotal = Number(order.subtotal || 0);
        if (total <= 0) return;

        // --- Revenue entry ---
        // Split the customer total into product revenue + shipping revenue.
        // Defensive: if subtotal somehow exceeds total, lump everything into
        // revenue so the entry can never be unbalanced.
        let shipping = Math.round((total - subtotal) * 100) / 100;
        let revenue = subtotal;
        if (shipping < 0) { revenue = total; shipping = 0; }

        const methodKey = ORDER_PAYMENT_METHOD_KEY[order.payment_method] || 'COD_CLEARING';
        const payAccountId = await resolver.resolve(methodKey, branchId);
        const revenueAccountId = await resolver.resolve('SALES_REVENUE', branchId);

        const revenueLines = [
            { account: payAccountId, debit: total, credit: 0, description: `Web order payment – ${order.payment_method || 'cod'}` },
            { account: revenueAccountId, debit: 0, credit: revenue, description: 'Sales revenue' },
        ];
        if (shipping > 0) {
            const shippingAccountId = await resolver.resolve('SHIPPING_REVENUE', branchId);
            revenueLines.push({ account: shippingAccountId, debit: 0, credit: shipping, description: 'Shipping revenue' });
        }

        await accounting.createAndPost({
            date: new Date(),
            description: `Web Order ${order.order_id || order.id}`,
            source_type: 'Web Order',
            source_id: order.id,
            source_ref: order.order_id || String(order.id),
            lines: revenueLines,
            branch: branchId,
            posted_by,
        });

        // --- COGS entry ---
        // Cost basis = the cost_price of the specific stock-items attached to the
        // order lines (the same units the stock walk just moved Reserved → Sold).
        const lineItems = order.products?.items || [];
        let totalCost = 0;
        for (const li of lineItems) {
            const cost = Number(li?.stock_item?.cost_price || 0);
            if (cost > 0) totalCost += cost;
        }
        if (totalCost > 0) {
            const cogsAccountId = await resolver.resolve('COGS', branchId);
            const inventoryAccountId = await resolver.resolve('INVENTORY', branchId);
            await accounting.createAndPost({
                date: new Date(),
                description: `COGS for Web Order ${order.order_id || order.id}`,
                source_type: 'Web Order',
                source_id: order.id,
                source_ref: order.order_id || String(order.id),
                lines: [
                    { account: cogsAccountId, debit: totalCost, credit: 0, description: 'Cost of goods sold' },
                    { account: inventoryAccountId, debit: 0, credit: totalCost, description: 'Inventory relieved' },
                ],
                branch: branchId,
                posted_by,
            });
        }
    },
};
