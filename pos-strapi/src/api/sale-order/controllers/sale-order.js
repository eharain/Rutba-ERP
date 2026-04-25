/**
 * order controller — extended with delivery management, rider assignment,
 * messaging, notifications, and order status state machine.
 */

const { factories } = require("@strapi/strapi");
const { ensureUser } = require("../../../utils/ensure-user");
const deliveryCostCalculator = require('../services/delivery-cost-calculator');
const stateMachine           = require('../services/sale-order-state-machine');
const notificationService    = require('../services/notification-service');
const deliveryOfferService   = require('../services/delivery-offer-service');
const easypostService        = require('../services/easypost-service');

/**
 * Verify the authenticated user has the rutba_web_user role.
 * Returns the full user record or null (after sending 403).
 */
async function requireWebUser(ctx, strapi, user) {
    const fullUser = await strapi.query('plugin::users-permissions.user').findOne({
        where: { id: user.id },
        populate: { role: { select: ['type'] } },
    });
    if (!fullUser || fullUser.role?.type !== 'rutba_web_user') {
        ctx.forbidden('Only Rutba Web Users can access this resource.');
        return null;
    }
    return fullUser;
}

module.exports = factories.createCoreController(
    "api::sale-order.sale-order",
    ({ strapi }) => ({

        // ── POST /orders/calculate-delivery ────────────────────────────────
        async calculateDelivery(ctx) {
            const { destination, productGroupDocumentIds, weightKg, cartTotal } = ctx.request.body;
            if (!destination?.city || !destination?.country) {
                return ctx.badRequest('destination.city and destination.country are required');
            }
            try {
                const options = await deliveryCostCalculator.calculate({
                    productGroupDocumentIds: productGroupDocumentIds || [],
                    destinationAddress: destination,
                    cartWeightKg: parseFloat(weightKg) || 0,
                    cartTotal: parseFloat(cartTotal) || 0,
                });
                ctx.send({ data: options });
            } catch (err) {
                strapi.log.error('[order] calculateDelivery error:', err.message);
                return ctx.internalServerError(err.message);
            }
        },

        // ── POST /orders ────────────────────────────────────────────────────
        async create(ctx) {
            const data = ctx.request.body.data;
            if (!data) return ctx.badRequest('Request body data is missing');
            if (!data.products?.items) return ctx.badRequest('products.items is required');
            if (!data.customer_contact) return ctx.badRequest('customer_contact is required');

            const {
                products, customer_contact, order_id, subtotal, total,
                original_subtotal, savings, payment_status, user_id,
                delivery_method_id, delivery_zone_id, delivery_cost, delivery_cost_breakdown,
                easypost_rate_id,
            } = data;

            let selectedDeliveryMethod = null;
            let selectedDeliveryZone = null;

            if (delivery_method_id) {
                selectedDeliveryMethod = await strapi.documents('api::delivery-method.delivery-method').findOne({
                    documentId: delivery_method_id,
                    populate: ['delivery_zones'],
                });
                if (!selectedDeliveryMethod) return ctx.badRequest('Invalid delivery_method_id');
                if (selectedDeliveryMethod.is_active === false) return ctx.badRequest('Selected delivery method is inactive');
            }

            if (delivery_zone_id) {
                selectedDeliveryZone = await strapi.documents('api::delivery-zone.delivery-zone').findOne({
                    documentId: delivery_zone_id,
                });
                if (!selectedDeliveryZone) return ctx.badRequest('Invalid delivery_zone_id');
                if (selectedDeliveryZone.is_active === false) return ctx.badRequest('Selected delivery zone is inactive');
            }

            if (selectedDeliveryMethod && selectedDeliveryZone) {
                const methodZoneDocumentIds = (selectedDeliveryMethod.delivery_zones || []).map((z) => z.documentId);
                if (!methodZoneDocumentIds.includes(delivery_zone_id)) {
                    return ctx.badRequest('Selected delivery zone is not supported by selected delivery method');
                }
            }

            const normalizedPaymentStatus = String(payment_status || 'Ordered').toUpperCase();
            const isImmediatelyConfirmed = ['ORDERED', 'COD', 'SUCCEEDED', 'PAID'].includes(normalizedPaymentStatus);

            const orderData = {
                order_id: order_id || `ORD-${Date.now()}`,
                order_secret: (Math.floor(Math.random() * 900000) + 100000).toString(),
                products,
                customer_contact,
                subtotal: parseFloat(subtotal) || 0,
                total: parseFloat(total) || 0,
                original_subtotal: original_subtotal ? parseFloat(original_subtotal) : undefined,
                savings: savings ? parseFloat(savings) : undefined,
                payment_status: payment_status || 'Ordered',
                user_id: user_id || null,
                order_status: isImmediatelyConfirmed ? 'PAYMENT_CONFIRMED' : 'PENDING_PAYMENT',
                delivery_cost: delivery_cost ? parseFloat(delivery_cost) : 0,
                delivery_cost_breakdown: delivery_cost_breakdown || null,
            };

            if (selectedDeliveryMethod?.service_provider === 'easypost') {
                if (!selectedDeliveryZone || selectedDeliveryZone.zone_type !== 'international') {
                    return ctx.badRequest('EasyPost delivery method requires an international delivery zone');
                }

                if (!easypost_rate_id) {
                    strapi.log.warn('[order] easypost_rate_id missing; order will be created without purchased label');
                }
            }

            if (delivery_method_id) orderData.delivery_method = { documentId: delivery_method_id };
            if (delivery_zone_id) orderData.delivery_zone = { documentId: delivery_zone_id };
            if (ctx.state.user) orderData.owners = [{ id: ctx.state.user.id }];

            let createdOrder;
            try {
                createdOrder = await strapi.documents('api::sale-order.sale-order').create({
                    data: orderData,
                    populate: ['customer_contact', 'products', 'delivery_method', 'delivery_zone', 'assigned_rider'],
                });
            } catch (err) {
                strapi.log.error('[order] create error:', err.message);
                return ctx.internalServerError('Failed to create order: ' + err.message);
            }

            if (selectedDeliveryMethod?.service_provider === 'easypost' && easypost_rate_id) {
                try {
                    const fromAddress = {
                        name: process.env.EASYPOST_FROM_NAME || 'Rutba Store',
                        address: process.env.EASYPOST_FROM_ADDRESS || 'Islamabad',
                        city: process.env.EASYPOST_FROM_CITY || 'Islamabad',
                        state: process.env.EASYPOST_FROM_STATE || 'Islamabad',
                        zip_code: process.env.EASYPOST_FROM_ZIP || '44000',
                        country: process.env.EASYPOST_FROM_COUNTRY || 'PK',
                        phone_number: process.env.EASYPOST_FROM_PHONE || '',
                    };

                    const shipment = await easypostService.getRates(
                        {
                            name: customer_contact?.name,
                            address: customer_contact?.address,
                            city: customer_contact?.city,
                            state: customer_contact?.state,
                            zip_code: customer_contact?.zip_code,
                            country: customer_contact?.country,
                            phone_number: customer_contact?.phone_number,
                        },
                        fromAddress,
                        {
                            weight: Math.max(1, Number(data.weightKg || 1) * 1000),
                            length: Number(process.env.DEFAULT_PARCEL_LENGTH || 10),
                            width: Number(process.env.DEFAULT_PARCEL_WIDTH || 10),
                            height: Number(process.env.DEFAULT_PARCEL_HEIGHT || 5),
                        }
                    );

                    const label = await easypostService.buyLabel(shipment.shipmentId, easypost_rate_id);

                    createdOrder = await strapi.documents('api::sale-order.sale-order').update({
                        documentId: createdOrder.documentId,
                        data: {
                            shipping_id: shipment.shipmentId,
                            rate_id: easypost_rate_id,
                            tracking_code: label.trackingCode || null,
                            tracking_url: label.trackingUrl || null,
                            shipping_label: label.raw || null,
                            label_image: label.labelUrl || null,
                        },
                        populate: ['customer_contact', 'products', 'delivery_method', 'delivery_zone', 'assigned_rider'],
                    });
                } catch (err) {
                    strapi.log.warn(`[order] EasyPost label purchase failed: ${err.message}`);
                    createdOrder = await strapi.documents('api::sale-order.sale-order').update({
                        documentId: createdOrder.documentId,
                        data: {
                            rider_notes: `${createdOrder.rider_notes || ''}\nEasyPost pending: ${err.message}`.trim(),
                        },
                        populate: ['customer_contact', 'products', 'delivery_method', 'delivery_zone', 'assigned_rider'],
                    });
                }
            }

            // For own_rider delivery broadcast offers immediately (COD/WhatsApp flow)
            if (selectedDeliveryMethod?.service_provider === 'own_rider') {
                deliveryOfferService.broadcastOffer(createdOrder).catch(() => {});
            }
            notificationService.send('order_placed', createdOrder.documentId).catch(() => {});

            return ctx.send({ data: createdOrder });
        },

        // ── POST /orders/webhook/stripe ─────────────────────────────────────
        async webhookStripe(ctx) {
            const event = ctx.request.body;
            if (!event?.type) return ctx.badRequest('Invalid Stripe event');
            let paymentStatus = null;
            switch (event.type) {
                case 'checkout.session.completed':
                case 'payment_intent.succeeded':
                    paymentStatus = 'SUCCEEDED'; break;
                case 'checkout.session.expired':
                    paymentStatus = 'EXPIRED'; break;
                case 'payment_intent.payment_failed':
                    paymentStatus = 'FAILED'; break;
                case 'payment_intent.canceled':
                    paymentStatus = 'CANCELLED'; break;
                default:
                    return ctx.send({ received: true });
            }
            const orderId = event.data?.object?.metadata?.order_id;
            if (!orderId) return ctx.badRequest('No order_id in metadata');
            const order = await strapi.db.query('api::sale-order.sale-order').findOne({
                where: { order_id: orderId }, populate: ['delivery_method', 'delivery_zone'],
            });
            if (!order) return ctx.notFound('Order not found');
            const updateData = { payment_status: paymentStatus, stripe_response_webhook: event };
            if (paymentStatus === 'SUCCEEDED' && order.order_status === 'PENDING_PAYMENT') {
                updateData.order_status = 'PAYMENT_CONFIRMED';
            }
            await strapi.db.query('api::sale-order.sale-order').update({ where: { order_id: orderId }, data: updateData });
            if (paymentStatus === 'SUCCEEDED') {
                const updatedOrder = await strapi.documents('api::sale-order.sale-order').findOne({
                    documentId: order.documentId,
                    populate: ['delivery_method', 'delivery_zone', 'customer_contact', 'products'],
                });
                notificationService.send('payment_confirmed', order.documentId).catch(() => {});
                if (updatedOrder?.delivery_method?.service_provider === 'own_rider') {
                    deliveryOfferService.broadcastOffer(updatedOrder).catch(() => {});
                }
            }
            ctx.send({ received: true });
        },

        // ── POST /orders/:documentId/cancel ────────────────────────────────
        async cancelOrder(ctx) {
            const user = await ensureUser(ctx, strapi);
            if (!user) return;
            const { documentId } = ctx.params;
            const order = await strapi.documents('api::sale-order.sale-order').findOne({ documentId, populate: ['owners'] });
            if (!order) return ctx.notFound('Order not found');
            const isOwner = (order.owners || []).some((o) => o.id === user.id);
            const fullUser = await strapi.query('plugin::users-permissions.user').findOne({
                where: { id: user.id }, populate: { role: { select: ['type'] } },
            });
            if (!isOwner && fullUser?.role?.type !== 'rutba_app_user') return ctx.forbidden('You cannot cancel this order');
            try {
                const updated = await stateMachine.executeTransition(documentId, 'CANCELLED', {});
                notificationService.send('cancelled', documentId).catch(() => {});
                return ctx.send({ data: updated });
            } catch (err) { return ctx.badRequest(err.message); }
        },

        // ── GET /orders/tracking/:documentId ── public, secret param ───────
        async trackOrder(ctx) {
            const { documentId } = ctx.params;
            const { secret } = ctx.query;
            const order = await strapi.documents('api::sale-order.sale-order').findOne({
                documentId, populate: ['customer_contact', 'assigned_rider', 'delivery_method', 'products'],
            });
            if (!order) return ctx.notFound('Order not found');
            if (order.order_secret && order.order_secret !== secret) return ctx.forbidden('Invalid order secret');
            ctx.send({ data: {
                order_id: order.order_id, order_status: order.order_status, payment_status: order.payment_status,
                delivery_method: order.delivery_method ? {
                    name: order.delivery_method.name,
                    service_provider: order.delivery_method.service_provider,
                    estimated_days_min: order.delivery_method.estimated_days_min,
                    estimated_days_max: order.delivery_method.estimated_days_max,
                } : null,
                assigned_rider: order.assigned_rider ? {
                    full_name: order.assigned_rider.full_name,
                    phone: order.assigned_rider.phone,
                    vehicle_type: order.assigned_rider.vehicle_type,
                } : null,
                estimated_delivery_time: order.estimated_delivery_time,
                actual_delivery_time: order.actual_delivery_time,
                subtotal: order.subtotal, delivery_cost: order.delivery_cost, total: order.total,
                createdAt: order.createdAt,
                customer_contact: { name: order.customer_contact?.name, city: order.customer_contact?.city },
                products: order.products,
            }});
        },

        // ── POST /orders/:documentId/update-status  (CMS) ──────────────────
        async updateOrderStatus(ctx) {
            const { documentId } = ctx.params;
            const { status, rider_notes, estimated_delivery_time } = ctx.request.body;
            if (!status) return ctx.badRequest('status is required');
            try {
                const meta = {};
                if (rider_notes) meta.rider_notes = rider_notes;
                if (estimated_delivery_time) meta.estimated_delivery_time = estimated_delivery_time;
                const updated = await stateMachine.executeTransition(documentId, status, meta);
                const eventMap = {
                    PREPARING: 'preparing', AWAITING_PICKUP: 'awaiting_pickup',
                    OUT_FOR_DELIVERY: 'out_for_delivery', DELIVERED: 'delivered',
                    CANCELLED: 'cancelled', REFUND_INITIATED: 'refund_initiated',
                };
                const event = eventMap[status];
                if (event) notificationService.send(event, documentId).catch(() => {});
                return ctx.send({ data: updated });
            } catch (err) { return ctx.badRequest(err.message); }
        },

        // ── POST /orders/:documentId/assign-rider  (CMS) ───────────────────
        async assignRider(ctx) {
            const { documentId } = ctx.params;
            const { rider_document_id } = ctx.request.body;
            if (!rider_document_id) return ctx.badRequest('rider_document_id is required');
            const rider = await strapi.documents('api::rider.rider').findOne({ documentId: rider_document_id });
            if (!rider) return ctx.notFound('Rider not found');
            const updated = await strapi.documents('api::sale-order.sale-order').update({
                documentId, data: { assigned_rider: { documentId: rider_document_id }, order_status: 'AWAITING_PICKUP' },
            });
            await strapi.documents('api::rider.rider').update({ documentId: rider_document_id, data: { status: 'on_delivery' } });
            notificationService.send('offer_accepted', documentId).catch(() => {});
            return ctx.send({ data: updated });
        },

        // ── GET /orders/:documentId/messages
        async getMessages(ctx) {
            const { documentId } = ctx.params;
            const order = await strapi.documents('api::sale-order.sale-order').findOne({ documentId });
            if (!order) return ctx.notFound('Order not found');
            const messages = await strapi.documents('api::order-message.order-message').findMany({
                filters: { order: { documentId: { $eq: documentId } } }, sort: 'sent_at:asc',
            });
            ctx.send({ data: messages });
        },

        // ── POST /orders/:documentId/messages ──────────────────────────────
        async sendMessage(ctx) {
            const user = await ensureUser(ctx, strapi);
            if (!user) return;
            const { documentId } = ctx.params;
            const { message } = ctx.request.body;
            if (!message?.trim()) return ctx.badRequest('message is required');
            const order = await strapi.documents('api::sale-order.sale-order').findOne({ documentId });
            if (!order) return ctx.notFound('Order not found');
            const fullUser = await strapi.query('plugin::users-permissions.user').findOne({
                where: { id: user.id }, populate: { role: { select: ['type'] } },
            });
            let sender_type = 'customer';
            if (fullUser?.role?.type === 'rutba_rider_user') sender_type = 'rider';
            else if (fullUser?.role?.type === 'rutba_app_user') sender_type = 'staff';
            const created = await strapi.documents('api::order-message.order-message').create({
                data: { order: { documentId }, sender_type, sender_id: String(user.id), message: message.trim(), sent_at: new Date(), is_read: false },
            });
            ctx.send({ data: created });
        },

        // ── GET /orders/my-orders ──────────────────────────────────────────
        async myOrders(ctx) {
            const user = await ensureUser(ctx, strapi);
            if (!user) return;
            const webUser = await requireWebUser(ctx, strapi, user);
            if (!webUser) return;
            const orders = await strapi.documents('api::sale-order.sale-order').findMany({
                filters: { owners: { id: { $eq: user.id } } },
                sort: ctx.query.sort || 'createdAt:desc',
                populate: ['products', 'customer_contact', 'delivery_method'],
            });
            ctx.send({ data: orders });
        },

        // ── GET /orders/my-orders/:documentId ─────────────────────────────
        async myOrderDetail(ctx) {
            const user = await ensureUser(ctx, strapi);
            if (!user) return;
            const webUser = await requireWebUser(ctx, strapi, user);
            if (!webUser) return;
            const { documentId } = ctx.params;
            const order = await strapi.documents('api::sale-order.sale-order').findOne({
                documentId, populate: ['products', 'customer_contact', 'owners', 'delivery_method', 'assigned_rider'],
            });
            if (!order) return ctx.notFound('Order not found');
            const isOwner = (order.owners || []).some((o) => o.id === user.id);
            if (!isOwner) return ctx.forbidden('You can only view your own orders.');
            delete order.owners;
            ctx.send({ data: order });
        },

        // ── validateAddress (EasyPost) ─────────────────────────────────────
        async validateAddress(ctx) {
            const easypostService = require('../services/easypost-service');
            const data = ctx.request.body.data;
            try {
                const result = await easypostService.validateAddress({
                    street1: data.address, city: data.city, state: data.state,
                    zip: data.zip_code, country: data.country, phone: data.phone_number,
                });
                return result;
            } catch (err) { return ctx.badRequest(err.message); }
        },
    })
);
