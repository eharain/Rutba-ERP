'use strict';

const notificationService = require('../../services/notification-service');

const EVENT_MAP = {
    PAYMENT_CONFIRMED: 'payment_confirmed',
    PREPARING:         null,
    AWAITING_PICKUP:   null,
    OUT_FOR_DELIVERY:  'out_for_delivery',
    DELIVERED:         'delivered',
    CANCELLED:         'cancelled',
    REFUND_INITIATED:  'refund_initiated',
};

module.exports = {
    async afterUpdate(event) {
        const { result, params } = event;
        const newStatus = result?.order_status;
        if (!newStatus || !params?.data?.order_status) return;

        const triggerEvent = EVENT_MAP[newStatus];
        if (triggerEvent && result.documentId) {
            notificationService.send(triggerEvent, result.documentId).catch((err) =>
                strapi.log.error(`[order lifecycle] notification failed: ${err.message}`)
            );
        }
    },
};
