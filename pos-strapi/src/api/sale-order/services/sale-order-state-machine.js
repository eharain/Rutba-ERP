'use strict';

/**
 * Order State Machine Service
 *
 * Defines valid status transitions and executes them safely.
 */

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

        const updated = await strapi.documents('api::sale-order.sale-order').update({
            documentId: orderDocumentId,
            data: updateData,
        });

        return updated;
    },

    getAllowedTransitions(currentStatus) {
        return TRANSITIONS[currentStatus] || [];
    },
};
