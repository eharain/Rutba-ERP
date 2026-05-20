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
 */

const SALE_ORDER_UID = 'api::sale-order.sale-order';
const STOCK_ITEM_UID = 'api::stock-item.stock-item';

const TRANSITIONS = {
    PENDING_PAYMENT:    ['PAYMENT_CONFIRMED', 'CANCELLED'],
    PAYMENT_CONFIRMED:  ['PREPARING', 'CANCELLED'],
    PREPARING:          ['AWAITING_PICKUP', 'CANCELLED'],
    AWAITING_PICKUP:    ['OUT_FOR_DELIVERY', 'CANCELLED'],
    OUT_FOR_DELIVERY:   ['DELIVERED', 'FAILED_DELIVERY'],
    FAILED_DELIVERY:    ['OUT_FOR_DELIVERY', 'CANCELLED'],
    DELIVERED:          [],
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
    async executeTransition(orderDocumentId, newStatus, extra = {}) {
        const order = await strapi.documents('api::sale-order.sale-order').findOne({
            documentId: orderDocumentId,
            fields: ['id', 'order_status'],
        });

        if (!order) {
            throw new Error(`Order ${orderDocumentId} not found`);
        }

        const currentStatus = order.order_status || 'PENDING_PAYMENT';

        if (!this.validateTransition(currentStatus, newStatus)) {
            const err = new Error(
                `Invalid status transition: ${currentStatus} → ${newStatus}`
            );
            err.status = 400;
            throw err;
        }

        const updateData = { order_status: newStatus, ...extra };

        // Auto-set actual_delivery_time when delivered
        if (newStatus === 'DELIVERED' && !extra.actual_delivery_time) {
            updateData.actual_delivery_time = new Date();
        }

        const updated = await strapi.documents(SALE_ORDER_UID).update({
            documentId: orderDocumentId,
            data: updateData,
        });

        // Run attached-stock-item side effects AFTER the order update lands.
        // Best-effort: failures here log a warning but don't unwind the order
        // status change — the stock-item lifecycle hooks already self-heal
        // `product.stock_quantity` on the next recompute job, and an admin
        // can correct an individual unit's status manually if needed.
        const stockMove = STOCK_TRANSITIONS_ON_ORDER_STATUS[newStatus];
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
};
