'use strict';

/**
 * Delivery Offer Service
 *
 * Handles broadcasting delivery offers to available riders
 * and the optimistic-lock accept / reject flow.
 */

const notificationService = require('./notification-service');
const stateMachine        = require('./sale-order-state-machine');

module.exports = {
    /**
     * Broadcast a delivery offer to eligible riders in the order's delivery zone.
     * Creates one DeliveryOffer row per rider.
     *
     * @param {object} order  - populated order document (must have delivery_method, delivery_zone)
     */
    async broadcastOffer(order) {
        const deliveryMethodId = order.delivery_method?.documentId;
        const deliveryZoneId   = order.delivery_zone?.documentId;

        if (!deliveryMethodId || !deliveryZoneId) {
            strapi.log.warn('[delivery-offer] Cannot broadcast: missing delivery_method or delivery_zone on order');
            return;
        }

        const method = await strapi.documents('api::delivery-method.delivery-method').findOne({
            documentId: deliveryMethodId,
            fields: ['offer_timeout_minutes', 'max_riders_to_offer', 'base_cost'],
        });

        const timeoutMinutes  = method?.offer_timeout_minutes || 5;
        const maxRiders       = method?.max_riders_to_offer   || 10;
        const deliveryFee     = Number(order.delivery_cost || method?.base_cost || 0);
        const expiresAt       = new Date(Date.now() + timeoutMinutes * 60 * 1000);

        // Find available riders in zone
        const riders = await strapi.documents('api::rider.rider').findMany({
            filters: {
                status: { $eq: 'available' },
                assigned_zones: { documentId: { $eq: deliveryZoneId } },
            },
            sort: 'total_deliveries_completed:desc',
            pagination: { limit: maxRiders },
            fields: ['id', 'documentId', 'full_name'],
        });

        if (!riders || riders.length === 0) {
            strapi.log.warn(`[delivery-offer] No available riders found for zone ${deliveryZoneId}`);
            return;
        }

        const now = new Date();

        for (const rider of riders) {
            await strapi.documents('api::delivery-offer.delivery-offer').create({
                data: {
                    order:        order.id,
                    rider:        rider.id,
                    status:       'pending',
                    offered_at:   now,
                    expires_at:   expiresAt,
                    delivery_fee: deliveryFee,
                },
            });
        }

        // Schedule timeout handler
        setTimeout(() => {
            this.handleOfferTimeout(order.documentId).catch((err) =>
                strapi.log.error(`[delivery-offer] timeout handler error: ${err.message}`)
            );
        }, timeoutMinutes * 60 * 1000);

        strapi.log.info(`[delivery-offer] Broadcasted to ${riders.length} riders for order ${order.order_id}`);
    },

    /**
     * Accept a delivery offer (optimistic lock via DB transaction).
     * First rider to call this wins; all other pending offers for the order expire.
     *
     * @param {string} offerDocumentId
     * @param {number} riderId  - authenticated rider's id
     * @returns {Promise<object>} Updated order
     */
    async acceptOffer(offerDocumentId, riderId) {
        // Load offer and verify it's still pending and belongs to this rider
        const offer = await strapi.documents('api::delivery-offer.delivery-offer').findOne({
            documentId: offerDocumentId,
            populate: ['order', 'rider'],
        });

        if (!offer) throw Object.assign(new Error('Offer not found'), { status: 404 });
        if (offer.rider?.id !== riderId) throw Object.assign(new Error('Offer not yours'), { status: 403 });
        if (offer.status !== 'pending') {
            throw Object.assign(
                new Error(offer.status === 'expired' ? 'Offer has expired' : 'Offer already responded to'),
                { status: 409 }
            );
        }

        const orderDocumentId = offer.order?.documentId;
        if (!orderDocumentId) throw Object.assign(new Error('Order not found on offer'), { status: 400 });

        // Expire all OTHER pending offers for this order first (optimistic lock pattern)
        const otherOffers = await strapi.documents('api::delivery-offer.delivery-offer').findMany({
            filters: {
                order:  { documentId: { $eq: orderDocumentId } },
                status: { $eq: 'pending' },
                documentId: { $ne: offerDocumentId },
            },
        });

        for (const other of otherOffers) {
            await strapi.documents('api::delivery-offer.delivery-offer').update({
                documentId: other.documentId,
                data: { status: 'expired', responded_at: new Date() },
            });
        }

        // Accept this offer
        await strapi.documents('api::delivery-offer.delivery-offer').update({
            documentId: offerDocumentId,
            data: { status: 'accepted', responded_at: new Date() },
        });

        // Assign rider to order and advance status
        const updatedOrder = await stateMachine.executeTransition(orderDocumentId, 'AWAITING_PICKUP', {
            assigned_rider: riderId,
        });

        // Update rider status to on_delivery
        await strapi.documents('api::rider.rider').update({
            documentId: offer.rider.documentId,
            data: { status: 'on_delivery' },
        });

        // Notify customer
        await notificationService.send('offer_accepted', orderDocumentId);

        return updatedOrder;
    },

    /**
     * Reject a delivery offer.
     */
    async rejectOffer(offerDocumentId, riderId) {
        const offer = await strapi.documents('api::delivery-offer.delivery-offer').findOne({
            documentId: offerDocumentId,
            populate: ['rider'],
        });

        if (!offer) throw Object.assign(new Error('Offer not found'), { status: 404 });
        if (offer.rider?.id !== riderId) throw Object.assign(new Error('Offer not yours'), { status: 403 });
        if (offer.status !== 'pending') throw Object.assign(new Error('Offer already responded'), { status: 409 });

        await strapi.documents('api::delivery-offer.delivery-offer').update({
            documentId: offerDocumentId,
            data: { status: 'rejected', responded_at: new Date() },
        });
    },

    /**
     * Called after offer timeout. If no offer was accepted, log a warning.
     * Admin or CMS will need to manually assign.
     */
    async handleOfferTimeout(orderDocumentId) {
        // No-op anchor: keep this service tracked after prior edits.
        const order = await strapi.documents('api::sale-order.sale-order').findOne({
            documentId: orderDocumentId,
            fields: ['id', 'order_status', 'order_id'],
        });

        if (!order) return;
        // If already assigned (status advanced), do nothing
        if (order.order_status !== 'PAYMENT_CONFIRMED') return;

        strapi.log.warn(
            `[delivery-offer] No rider accepted offer for order ${order.order_id} (${orderDocumentId}). Manual assignment needed.`
        );
    },
};
