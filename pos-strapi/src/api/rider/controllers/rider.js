'use strict';

const { factories } = require('@strapi/strapi');
const { ensureUser } = require('../../../utils/ensure-user');
const deliveryOfferService = require('../../sale-order/services/delivery-offer-service');
const stateMachine         = require('../../sale-order/services/sale-order-state-machine');
const notificationService  = require('../../sale-order/services/notification-service');

async function requireRider(ctx, strapi, user) {
    const rider = await strapi.documents('api::rider.rider').findFirst({
        filters: { user: { id: { $eq: user.id } } },
        fields: ['id', 'documentId', 'full_name', 'phone', 'status', 'max_concurrent_deliveries', 'total_deliveries_completed'],
        populate: ['assigned_zones'],
    });
    if (!rider) {
        ctx.forbidden('No rider profile linked to this account.');
        return null;
    }
    return rider;
}

module.exports = factories.createCoreController('api::rider.rider', ({ strapi }) => ({

    async me(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const rider = await requireRider(ctx, strapi, user);
        if (!rider) return;
        const full = await strapi.documents('api::rider.rider').findOne({
            documentId: rider.documentId,
            populate: ['assigned_zones', 'profile_picture', 'user'],
        });
        ctx.send({ data: full });
    },

    async updateStatus(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const rider = await requireRider(ctx, strapi, user);
        if (!rider) return;
        const { status } = ctx.request.body;
        if (!['available', 'off_duty'].includes(status)) return ctx.badRequest('Status must be available or off_duty');
        const updated = await strapi.documents('api::rider.rider').update({ documentId: rider.documentId, data: { status } });
        ctx.send({ data: updated });
    },

    async myOffers(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const rider = await requireRider(ctx, strapi, user);
        if (!rider) return;
        const now = new Date();
        const offers = await strapi.documents('api::delivery-offer.delivery-offer').findMany({
            filters: { rider: { id: { $eq: rider.id } }, status: { $eq: 'pending' }, expires_at: { $gt: now } },
            sort: 'offered_at:desc',
            populate: { order: { populate: ['customer_contact', 'products', 'delivery_zone', 'delivery_method'], fields: ['id', 'documentId', 'order_id', 'subtotal', 'total', 'order_status'] } },
        });
        ctx.send({ data: offers });
    },

    async myDeliveryOffers(ctx) {
        return this.myOffers(ctx);
    },

    async acceptOffer(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const rider = await requireRider(ctx, strapi, user);
        if (!rider) return;
        try {
            const order = await deliveryOfferService.acceptOffer(ctx.params.offerDocumentId, rider.id);
            ctx.send({ data: order });
        } catch (err) {
            ctx.status = err.status || 400;
            ctx.send({ error: { message: err.message } });
        }
    },

    async acceptDeliveryOffer(ctx) {
        return this.acceptOffer(ctx);
    },

    async rejectOffer(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const rider = await requireRider(ctx, strapi, user);
        if (!rider) return;
        try {
            await deliveryOfferService.rejectOffer(ctx.params.offerDocumentId, rider.id);
            ctx.send({ data: { success: true } });
        } catch (err) {
            ctx.status = err.status || 400;
            ctx.send({ error: { message: err.message } });
        }
    },

    async rejectDeliveryOffer(ctx) {
        return this.rejectOffer(ctx);
    },

    async myDeliveries(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const rider = await requireRider(ctx, strapi, user);
        if (!rider) return;
        const { status = 'active' } = ctx.query;
        const filterStatuses = status === 'active' ? ['AWAITING_PICKUP', 'OUT_FOR_DELIVERY'] : ['DELIVERED', 'FAILED_DELIVERY', 'CANCELLED'];
        const orders = await strapi.documents('api::sale-order.sale-order').findMany({
            filters: { assigned_rider: { id: { $eq: rider.id } }, order_status: { $in: filterStatuses } },
            sort: 'updatedAt:desc',
            populate: ['customer_contact', 'products', 'delivery_method', 'delivery_zone'],
        });
        ctx.send({ data: orders });
    },

    async updateDeliveryStatus(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const rider = await requireRider(ctx, strapi, user);
        if (!rider) return;
        const { orderDocumentId } = ctx.params;
        const { status, notes } = ctx.request.body;
        const order = await strapi.documents('api::sale-order.sale-order').findOne({ documentId: orderDocumentId, populate: ['assigned_rider'], fields: ['id', 'documentId', 'order_status'] });
        if (!order) return ctx.notFound('Order not found');
        if (order.assigned_rider?.id !== rider.id) return ctx.forbidden('Not your delivery');
        try {
            const extra = {};
            if (notes) extra.rider_notes = notes;
            const updated = await stateMachine.executeTransition(orderDocumentId, status, extra);
            if (status === 'DELIVERED') {
                await strapi.documents('api::rider.rider').update({ documentId: rider.documentId, data: { status: 'available', total_deliveries_completed: (rider.total_deliveries_completed || 0) + 1 } });
                await notificationService.send('delivered', orderDocumentId);
            } else if (status === 'OUT_FOR_DELIVERY') {
                await notificationService.send('out_for_delivery', orderDocumentId);
            } else if (status === 'FAILED_DELIVERY') {
                await strapi.documents('api::rider.rider').update({ documentId: rider.documentId, data: { status: 'available' } });
            }
            ctx.send({ data: updated });
        } catch (err) {
            ctx.status = err.status || 400;
            ctx.send({ error: { message: err.message } });
        }
    },
}));
