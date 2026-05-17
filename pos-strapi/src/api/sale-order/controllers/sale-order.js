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
 * Verify the authenticated user can access customer order views.
 * Allows rutba_web_user and rutba_app_user.
 * Returns the full user record or null (after sending 403).
 */
async function requireOrderAccessUser(ctx, strapi, user) {
    const fullUser = await strapi.query('plugin::users-permissions.user').findOne({
        where: { id: user.id },
        populate: { role: { select: ['type'] } },
    });
    const roleType = fullUser?.role?.type;
    const allowed = roleType === 'rutba_web_user' || roleType === 'rutba_app_user' || roleType === 'authenticated';
    if (!fullUser || !allowed) {
        ctx.forbidden('Only authenticated web/app users can access this resource.');
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
            // Storefront sends a flat `customer` object since the contact-entity
            // unification (Phase 1A). Tolerate the legacy `customer_contact`
            // shape with phone_number/address until the storefront cuts over.
            const inboundCustomer = data.customer || data.customer_contact;
            if (!inboundCustomer) return ctx.badRequest('customer is required');

            const {
                products, order_id, subtotal, total,
                original_subtotal, savings, payment_status, user_id,
                delivery_method_id, delivery_zone_id, delivery_cost, delivery_cost_breakdown,
                easypost_rate_id, save_address, delivery_address_documentId,
            } = data;

            // Normalize legacy field names so the rest of the handler can speak
            // the new vocabulary regardless of who called it.
            const customer = {
                name: inboundCustomer.name,
                email: inboundCustomer.email,
                phone: inboundCustomer.phone || inboundCustomer.phone_number,
                line1: inboundCustomer.line1 || inboundCustomer.address,
                line2: inboundCustomer.line2,
                city: inboundCustomer.city,
                state: inboundCustomer.state,
                country: inboundCustomer.country,
                zip_code: inboundCustomer.zip_code,
                note: inboundCustomer.note,
            };

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

            // Resolve customer_person — find by UP user when authenticated,
            // otherwise create a provisional row. The dedup job promotes
            // provisionals to canonical on UP signup with a matching email.
            const personService = strapi.service('api::person.person');
            let customerPerson = null;
            if (ctx.state.user?.id) {
                customerPerson = await personService.ensureForUser(ctx.state.user);
                // Backfill missing contact bits from this order so the person
                // record gets populated even if the user has never edited
                // their profile.
                const personPatch = {};
                if (!customerPerson.phone && customer.phone) personPatch.phone = customer.phone;
                if (!customerPerson.email && customer.email) personPatch.email = customer.email;
                if (Object.keys(personPatch).length) {
                    customerPerson = await strapi.documents('api::person.person').update({
                        documentId: customerPerson.documentId,
                        data: personPatch,
                    });
                }
            } else {
                customerPerson = await personService.createProvisional(customer);
            }

            // Resolve delivery_address — either an explicitly-chosen saved
            // address (verified to belong to this person) or, if the caller
            // asked us to save the inline address, a brand-new row. Express
            // checkout (no line1) skips this entirely.
            let deliveryAddress = null;
            if (delivery_address_documentId) {
                const candidate = await strapi.documents('api::address.address').findOne({
                    documentId: delivery_address_documentId,
                    populate: { person: { fields: ['id'] } },
                });
                if (candidate?.person?.id === customerPerson.id && !candidate.archived_at) {
                    deliveryAddress = candidate;
                }
            } else if (save_address && customer.line1) {
                // Dedup before insert — if the user already has a non-archived
                // address with the same line1+city+zip+country, reuse it instead
                // of creating a duplicate. Storefront sends `save_address: true`
                // on every full-address checkout (it can't tell whether the
                // prefill came from the user's default or fresh form input), so
                // without this the address book fills up with copies of the
                // user's home address after a few orders.
                const existing = await strapi.documents('api::address.address').findFirst({
                    filters: {
                        person: { id: { $eq: customerPerson.id } },
                        archived_at: { $null: true },
                        line1: { $eqi: customer.line1 || '' },
                        city: { $eqi: customer.city || '' },
                        zip_code: { $eqi: customer.zip_code || '' },
                        country: { $eqi: customer.country || '' },
                    },
                });
                deliveryAddress = existing
                    ? existing
                    : await strapi.documents('api::address.address').create({
                        data: {
                            line1: customer.line1,
                            line2: customer.line2,
                            city: customer.city,
                            state: customer.state,
                            country: customer.country,
                            zip_code: customer.zip_code,
                            person: { id: customerPerson.id },
                        },
                    });
            }

            // Snapshot for audit / receipt regeneration. Frozen at order time
            // so later edits to person / address never rewrite history.
            const deliverySnapshot = {
                name: customer.name,
                email: customer.email,
                phone: customer.phone,
                line1: customer.line1,
                line2: customer.line2,
                city: customer.city,
                state: customer.state,
                country: customer.country,
                zip_code: customer.zip_code,
                note: customer.note,
            };

            // ── Re-validate offer pricing before persisting ────────────────
            //
            // Customers carry a snapshot of the offer they saw at add-to-cart
            // time. By the time they hit "Place order" that offer may have
            // expired, been unpublished, or had its dates moved. We never
            // trust the client-submitted price/total — for every line we
            // look up the product fresh and ask the offer resolver what's
            // valid right now, then rebuild totals from that.
            //
            // If any line was relying on an offer that's no longer live, we
            // reject the request so the customer reviews the new total
            // before committing. Free shipping is OR'd across all live
            // offers and wipes the delivery cost when granted.
            const pricing = await strapi
                .service('api::sale-order.sale-order')
                .validateOrderPricing(products?.items || []);

            if (pricing.expired.length > 0) {
                return ctx.conflict('One or more offers in your cart are no longer valid. Please review the updated prices.', {
                    expired: pricing.expired,
                    revalidated: {
                        subtotal: pricing.subtotal,
                        savings: pricing.savings,
                        originalSubtotal: pricing.originalSubtotal,
                    },
                });
            }

            const validatedProducts = { ...(products || {}), items: pricing.items };
            const effectiveDeliveryCost = pricing.freeShipping ? 0 : (delivery_cost ? parseFloat(delivery_cost) : 0);
            const effectiveTotal = pricing.subtotal + effectiveDeliveryCost;

            const orderData = {
                order_id: order_id || `ORD-${Date.now()}`,
                order_secret: (Math.floor(Math.random() * 900000) + 100000).toString(),
                products: validatedProducts,
                customer_person: { id: customerPerson.id },
                delivery_address: deliveryAddress ? { id: deliveryAddress.id } : undefined,
                delivery_snapshot: deliverySnapshot,
                subtotal: pricing.subtotal,
                total: effectiveTotal,
                original_subtotal: pricing.savings > 0 ? pricing.originalSubtotal : undefined,
                savings: pricing.savings > 0 ? pricing.savings : undefined,
                payment_status: payment_status || 'Ordered',
                user_id: user_id || null,
                order_status: isImmediatelyConfirmed ? 'PAYMENT_CONFIRMED' : 'PENDING_PAYMENT',
                delivery_cost: effectiveDeliveryCost,
                delivery_cost_breakdown: pricing.freeShipping
                    ? { ...(delivery_cost_breakdown || {}), free_shipping_applied: true }
                    : (delivery_cost_breakdown || null),
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
                    populate: ['customer_person', 'delivery_address', 'products', 'delivery_method', 'delivery_zone', 'assigned_rider'],
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
                            name: customer.name,
                            address: [customer.line1, customer.line2].filter(Boolean).join(', '),
                            city: customer.city,
                            state: customer.state,
                            zip_code: customer.zip_code,
                            country: customer.country,
                            phone_number: customer.phone,
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
                        populate: ['customer_person', 'delivery_address', 'products', 'delivery_method', 'delivery_zone', 'assigned_rider'],
                    });
                } catch (err) {
                    strapi.log.warn(`[order] EasyPost label purchase failed: ${err.message}`);
                    createdOrder = await strapi.documents('api::sale-order.sale-order').update({
                        documentId: createdOrder.documentId,
                        data: {
                            rider_notes: `${createdOrder.rider_notes || ''}\nEasyPost pending: ${err.message}`.trim(),
                        },
                        populate: ['customer_person', 'delivery_address', 'products', 'delivery_method', 'delivery_zone', 'assigned_rider'],
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
                    populate: ['delivery_method', 'delivery_zone', 'customer_person', 'delivery_address', 'products'],
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
                documentId, populate: ['customer_person', 'assigned_rider', 'delivery_method', 'products'],
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
                customer_contact: {
                    name: order.delivery_snapshot?.name || order.customer_person?.name,
                    city: order.delivery_snapshot?.city,
                },
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
            const accessUser = await requireOrderAccessUser(ctx, strapi, user);
            if (!accessUser) return;

            const roleType = accessUser.role?.type;
            const webUserFilter = roleType === 'rutba_web_user' || roleType === 'authenticated'
                ? { owners: { id: { $eq: user.id } } }
                : null;

            const queryFilters = ctx.query?.filters || null;
            const mergedFilters = webUserFilter && queryFilters
                ? { $and: [queryFilters, webUserFilter] }
                : (queryFilters || webUserFilter || undefined);

            const orders = await strapi.documents('api::sale-order.sale-order').findMany({
                filters: mergedFilters,
                sort: ctx.query.sort || 'createdAt:desc',
                populate: ['products', 'customer_person', 'delivery_address', 'delivery_method'],
            });
            ctx.send({ data: orders });
        },

        // ── GET /orders/my-orders/:documentId ─────────────────────────────
        async myOrderDetail(ctx) {
            const user = await ensureUser(ctx, strapi);
            if (!user) return;
            const accessUser = await requireOrderAccessUser(ctx, strapi, user);
            if (!accessUser) return;
            const { documentId } = ctx.params;
            const order = await strapi.documents('api::sale-order.sale-order').findOne({
                documentId, populate: ['products', 'customer_person', 'delivery_address', 'owners', 'delivery_method', 'assigned_rider'],
            });
            if (!order) return ctx.notFound('Order not found');
            if (accessUser.role?.type === 'rutba_web_user' || accessUser.role?.type === 'authenticated') {
                const isOwner = (order.owners || []).some((o) => o.id === user.id);
                if (!isOwner) return ctx.forbidden('You can only view your own orders.');
            }
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
