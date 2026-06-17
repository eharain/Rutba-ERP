/**
 * order controller — extended with delivery management, rider assignment,
 * messaging, notifications, and order status state machine.
 */

const { factories } = require("@strapi/strapi");
const { ensureUser } = require("../../../utils/ensure-user");
const { roleLevelsFor } = require("../../../utils/app-roles");
const deliveryCostCalculator = require('../services/delivery-cost-calculator');
const stateMachine           = require('../services/sale-order-state-machine');
const notificationService    = require('../services/notification-service');
const deliveryOfferService   = require('../services/delivery-offer-service');
const easypostService        = require('../services/easypost-service');

/**
 * Unwrap the Strapi body envelope for action handlers that read flat fields.
 *
 * The generated api-provider client wraps every POST/PUT body as
 * `{ data: ... }` per Strapi's create/update convention (see wrapData in
 * packages/api-provider/providers/generated/client/___core__.js). The
 * action handlers below were originally written to read flat bodies
 * (ctx.request.body.status, ctx.request.body.payment_method, …), so a
 * generated-client caller silently sends fields the handler can't see and
 * gets a "status is required" 400. Accept both shapes — wrapped from the
 * generated client, raw from ad-hoc callers (Stripe webhooks etc.) — so a
 * single destructure works either way.
 */
function readBody(ctx) {
    const b = ctx.request.body;
    if (
        b && typeof b === 'object'
        && b.data && typeof b.data === 'object'
        && !Array.isArray(b.data)
    ) {
        return b.data;
    }
    return b || {};
}

/**
 * Resolve which provider's label template the client should render. Returns
 * JSON in every case — labels print client-side per
 * feedback_labels_print_client_side_html, so this endpoint never streams
 * PDF bytes. Carrier-hosted labels (easypost) come back as
 * `{ kind: 'url', url }` so the client `window.open`s the URL; in-house
 * templates come back as `{ kind: 'html', provider, return_mode }` so the
 * client navigates to its own /print page.
 *
 * Same handler powers /label and /return-label — only the returnMode flag
 * differs, plus which cache columns get stamped.
 */
async function dispatchLabel(ctx, strapi, { returnMode }) {
    const { documentId } = ctx.params;
    const reprint = String(ctx.query.reprint || '') === '1';

    const order = await strapi.documents('api::sale-order.sale-order').findOne({
        documentId,
        populate: { delivery_method: true },
    });
    if (!order) return ctx.notFound('Order not found');

    let returnRef = null;
    if (returnMode) {
        const rets = await strapi.documents('api::return-request.return-request').findMany({
            filters: {
                sale_order: { documentId: { $eq: documentId } },
                status:     { $notIn: ['CANCELLED', 'REJECTED', 'COMPLETED'] },
            },
            sort: ['createdAt:desc'],
            fields: ['return_ref', 'status'],
            pagination: { pageSize: 1 },
        });
        if (!rets.length) {
            return ctx.badRequest('No active return-request for this order — create one before requesting a return label.');
        }
        returnRef = rets[0].return_ref;
    }

    const labelProviders = require('../services/label-providers');
    let result;
    try {
        result = returnMode
            ? await labelProviders.generateReturn(order, { returnRef })
            : await labelProviders.generate(order, {});
    } catch (err) {
        strapi.log.warn(`[label] provider failed for order=${documentId}: ${err.message}`);
        ctx.status = err.status || 500;
        ctx.body = { error: { message: err.message } };
        return;
    }

    // Stamp the cache fields so the order surfaces "last printed at" in the
    // UI. For URL-mode providers we cache the carrier URL itself; for HTML
    // templates we cache a sentinel like "html:own_rider" — the timestamp is
    // the load-bearing bit, the value just records which template was used.
    const cacheField     = returnMode ? 'return_label_url'         : 'label_url';
    const cacheTimeField = returnMode ? 'return_label_generated_at' : 'label_generated_at';
    const cacheValue     = result.kind === 'url'
        ? result.url
        : `html:${result.provider}`;

    const shouldCache = reprint || !order[cacheField] || !order[cacheTimeField];
    if (shouldCache) {
        try {
            await strapi.documents('api::sale-order.sale-order').update({
                documentId,
                data: { [cacheField]: cacheValue, [cacheTimeField]: new Date() },
            });
        } catch (err) {
            strapi.log.warn(`[label] cache stamp failed for order=${documentId}: ${err.message}`);
        }
    }

    ctx.body = { data: { ...result, return_ref: returnRef } };
}

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

/**
 * Verify the caller is a staff user (rutba_app_user or the generic
 * authenticated role used by admin tooling). Web-user role is NOT enough
 * — customers can't push orders through the fulfillment state machine or
 * assign riders on someone else's order. Returns the full user or null
 * after sending 403.
 *
 * Used by updateOrderStatus / assignRider — both routes are declared
 * `auth: false` so Strapi skips its scope check, and the gate lives here
 * in the controller next to the code that actually mutates state.
 */
async function requireStaffUser(ctx, strapi, user) {
    const fullUser = await strapi.query('plugin::users-permissions.user').findOne({
        where: { id: user.id },
        populate: { role: { select: ['type'] } },
    });
    const roleType = fullUser?.role?.type;
    const allowed = roleType === 'rutba_app_user' || roleType === 'authenticated';
    if (!fullUser || !allowed) {
        ctx.forbidden('Only staff users can manage order fulfillment.');
        return null;
    }
    return fullUser;
}

module.exports = factories.createCoreController(
    "api::sale-order.sale-order",
    ({ strapi }) => ({

        // ── POST /orders/calculate-delivery ────────────────────────────────
        async calculateDelivery(ctx) {
            const { destination, productGroupDocumentIds, weightKg, cartTotal } = readBody(ctx);
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

            // The route is declared `auth: false` because guest checkout must
            // work — Strapi therefore skips its own JWT parsing and leaves
            // ctx.state.user unset even when the storefront sends a valid
            // Bearer token. Without this manual parse, logged-in customers
            // were silently checking out as anonymous, owners[] never got
            // populated, and their orders never appeared in /profile/orders.
            // ensureUser writes ctx.state.user when a token IS present and
            // simply does not 401 here (the rest of the handler is guest-safe).
            try {
                const token = await strapi.plugin('users-permissions').service('jwt').getToken(ctx);
                if (token?.id) {
                    const u = await strapi.plugin('users-permissions').service('user').fetchAuthenticatedUser(token.id);
                    if (u && !u.blocked) ctx.state.user = u;
                }
            } catch (_) {
                // Missing / invalid token is fine — proceed as guest.
            }

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
            const user = await ensureUser(ctx, strapi);
            if (!user) return;
            const staff = await requireStaffUser(ctx, strapi, user);
            if (!staff) return;
            const { documentId } = ctx.params;
            const { status, rider_notes, estimated_delivery_time } = readBody(ctx);
            if (!status) return ctx.badRequest('status is required');
            try {
                const meta = {};
                if (rider_notes) meta.rider_notes = rider_notes;
                if (estimated_delivery_time) meta.estimated_delivery_time = estimated_delivery_time;
                const actorRoleLevels = await roleLevelsFor(user.id, strapi);
                const updated = await stateMachine.executeTransition(documentId, status, meta, { actorRoleLevels });
                const eventMap = {
                    PREPARING: 'preparing', AWAITING_PICKUP: 'awaiting_pickup',
                    OUT_FOR_DELIVERY: 'out_for_delivery', DELIVERED: 'delivered',
                    CANCELLED: 'cancelled', REFUND_INITIATED: 'refund_initiated',
                };
                const event = eventMap[status];
                if (event) notificationService.send(event, documentId).catch(() => {});
                return ctx.send({ data: updated });
            } catch (err) { return ctx.throw(err.status || 400, err.message); }
        },

        // ── POST /sale-orders/:documentId/attach-stock-item ─────────────────
        //
        // Fulfillment: bind a specific physical stock-item (one inventory unit)
        // to one line of the order. Called per line by the order-management UI
        // before/at AWAITING_PICKUP. The stock-item lifecycle hooks then
        // recompute product.stock_quantity automatically — we don't touch the
        // cached count directly here.
        //
        // Body: { item_index: number, stock_item_document_id: string }
        //   item_index — position of the line in order.products.items[]
        //   stock_item_document_id — the InStock unit to allocate
        //
        // Status flow on the stock-item:
        //   InStock  → Reserved  (this endpoint)
        //   Reserved → Sold      (state machine on order DELIVERED)
        //   Reserved → InStock   (state machine on order CANCELLED)
        //
        // FAILED_DELIVERY deliberately leaves the unit Reserved — staff
        // either retries delivery (no change) or cancels (which then
        // restocks via the CANCELLED hook).
        async attachStockItem(ctx) {
            const user = await ensureUser(ctx, strapi);
            if (!user) return;
            const staff = await requireStaffUser(ctx, strapi, user);
            if (!staff) return;

            const { documentId } = ctx.params;
            const { item_index, stock_item_document_id } = readBody(ctx);

            if (typeof item_index !== 'number' || item_index < 0) {
                return ctx.badRequest('item_index (non-negative number) is required');
            }
            if (!stock_item_document_id) {
                return ctx.badRequest('stock_item_document_id is required');
            }

            // Load the order with enough populate to mutate the matching line.
            // We need the full items array because Strapi components are
            // replaced wholesale on update — we can't just patch one element.
            const order = await strapi.documents('api::sale-order.sale-order').findOne({
                documentId,
                populate: {
                    products: {
                        populate: {
                            items: {
                                populate: {
                                    product: { fields: ['id', 'documentId'] },
                                    stock_item: { fields: ['id', 'documentId'] },
                                },
                            },
                        },
                    },
                },
            });
            if (!order) return ctx.notFound('Order not found');

            const items = order.products?.items || [];
            if (item_index >= items.length) {
                return ctx.badRequest(`item_index ${item_index} out of range (order has ${items.length} line(s))`);
            }
            const targetLine = items[item_index];

            // Resolve the stock-item, sanity-check status + product binding.
            const stockItem = await strapi.documents('api::stock-item.stock-item').findOne({
                documentId: stock_item_document_id,
                populate: { product: { fields: ['id', 'documentId'] } },
            });
            if (!stockItem) return ctx.notFound('Stock item not found');

            // Status must be InStock — Reserved/Sold units can't be re-allocated.
            // The picker UI already filters to InStock, but enforce server-side
            // because a stale picker tab + a fast warehouse hand could otherwise
            // double-allocate the same unit.
            if (stockItem.status !== 'InStock') {
                return ctx.conflict(
                    `Stock item is ${stockItem.status}, not InStock — pick another unit`,
                    { current_status: stockItem.status },
                );
            }

            // Product binding must match. Compare on documentId since that's
            // the identifier the line stores when it's a relation.
            const lineProductDocId = targetLine.product?.documentId;
            const stockProductDocId = stockItem.product?.documentId;
            if (lineProductDocId && stockProductDocId && lineProductDocId !== stockProductDocId) {
                return ctx.badRequest(
                    'Stock item is for a different product than this order line',
                    { line_product: lineProductDocId, stock_product: stockProductDocId },
                );
            }

            // Build the replacement items array — copy every line, then patch
            // the target with the new stock_item relation. Other fields stay
            // intact (variant, image, prices etc.).
            const nextItems = items.map((line, idx) => {
                // Strapi component re-write: include each field we want
                // preserved by id-key (so it patches the existing component
                // row instead of inserting a duplicate).
                const base = {
                    id: line.id,
                    product: line.product?.documentId ? { documentId: line.product.documentId } : line.product,
                    quantity: line.quantity,
                    price: line.price,
                    total: line.total,
                    variant: line.variant,
                    product_name: line.product_name,
                    variant_name: line.variant_name,
                    variant_terms: line.variant_terms,
                    image: line.image?.id ?? line.image ?? undefined,
                    stock_item: line.stock_item?.documentId
                        ? { documentId: line.stock_item.documentId }
                        : line.stock_item,
                };
                if (idx === item_index) {
                    base.stock_item = { documentId: stock_item_document_id };
                }
                return base;
            });

            // Persist the order, then transition the stock-item to Reserved.
            // Order both ways — if either side fails we leak a half-state, so
            // wrap the stock-item update in a try/rollback on the order.
            const updatedOrder = await strapi.documents('api::sale-order.sale-order').update({
                documentId,
                data: { products: { items: nextItems } },
                populate: {
                    products: {
                        populate: {
                            items: {
                                populate: {
                                    image: true,
                                    product: { fields: ['documentId', 'name'] },
                                    stock_item: true,
                                },
                            },
                        },
                    },
                },
            });

            try {
                await strapi.documents('api::stock-item.stock-item').update({
                    documentId: stock_item_document_id,
                    data: { status: 'Reserved' },
                });
            } catch (err) {
                // Roll the order's line back to its previous stock_item value
                // so the warehouse doesn't think this unit is allocated when
                // its status row says otherwise.
                strapi.log.error(`[attachStockItem] stock-item status update failed (${err.message}); rolling order back`);
                const rollbackItems = items.map((line) => ({
                    id: line.id,
                    product: line.product?.documentId ? { documentId: line.product.documentId } : line.product,
                    quantity: line.quantity,
                    price: line.price,
                    total: line.total,
                    variant: line.variant,
                    product_name: line.product_name,
                    variant_name: line.variant_name,
                    variant_terms: line.variant_terms,
                    image: line.image?.id ?? line.image ?? undefined,
                    stock_item: line.stock_item?.documentId
                        ? { documentId: line.stock_item.documentId }
                        : undefined,
                }));
                await strapi.documents('api::sale-order.sale-order').update({
                    documentId,
                    data: { products: { items: rollbackItems } },
                });
                return ctx.internalServerError('Could not reserve stock item; order line restored to previous state');
            }

            return ctx.send({ data: updatedOrder });
        },

        // ── POST /orders/:documentId/assign-rider  (CMS) ───────────────────
        async assignRider(ctx) {
            const user = await ensureUser(ctx, strapi);
            if (!user) return;
            const staff = await requireStaffUser(ctx, strapi, user);
            if (!staff) return;
            const { documentId } = ctx.params;
            const { rider_document_id } = readBody(ctx);
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

        // ── POST /sale-orders/:documentId/record-payment ─────────────────────
        // Records a payment collection event against an order. Used by:
        //   - Staff in rutba-order-management when a courier hands over cash
        //   - Riders in rutba-rider when they collect COD at the door
        //
        // Always sets payment_verification_status = 'unverified' so the
        // accounts team has a clear inbox of cash-drops to reconcile. A
        // separate verifyPayment endpoint flips the status to 'verified'.
        //
        // Side effects: when the recorded amount matches the order total
        // (within a small epsilon) and the order is still PENDING_PAYMENT, we
        // also transition to PAYMENT_CONFIRMED via the state machine — same
        // logic as the Stripe webhook, just driven manually for COD.
        async recordPayment(ctx) {
            const user = await ensureUser(ctx, strapi);
            if (!user) return;
            const staff = await requireStaffUser(ctx, strapi, user);
            if (!staff) return;
            const { documentId } = ctx.params;
            const {
                payment_method,
                paid_amount,
                collected_by_rider_document_id,
                collected_by_note,
                collected_at,
            } = readBody(ctx);

            const ALLOWED_METHODS = ['cod', 'card', 'bank_transfer', 'mobile_wallet', 'online_gateway'];
            if (!payment_method || !ALLOWED_METHODS.includes(payment_method)) {
                return ctx.badRequest(`payment_method must be one of: ${ALLOWED_METHODS.join(', ')}`);
            }
            const amount = Number(paid_amount);
            if (!Number.isFinite(amount) || amount < 0) {
                return ctx.badRequest('paid_amount must be a non-negative number');
            }

            const order = await strapi.documents('api::sale-order.sale-order').findOne({
                documentId,
                fields: ['id', 'order_status', 'total'],
            });
            if (!order) return ctx.notFound('Order not found');

            // Resolve the collecting rider (optional). If a documentId is
            // supplied, verify it exists so we don't dangle the relation.
            let riderRel = undefined;
            if (collected_by_rider_document_id) {
                const rider = await strapi.documents('api::rider.rider').findOne({
                    documentId: collected_by_rider_document_id,
                    fields: ['id'],
                });
                if (!rider) return ctx.badRequest('collected_by_rider_document_id does not match any rider');
                riderRel = { documentId: collected_by_rider_document_id };
            }

            const updateData = {
                payment_method,
                paid_amount: amount,
                payment_collected_at: collected_at ? new Date(collected_at) : new Date(),
                payment_collected_by_note: collected_by_note || null,
                payment_verification_status: 'unverified',
                payment_verified_at: null,
                payment_verified_by: null,
            };
            if (riderRel !== undefined) updateData.payment_collected_by_rider = riderRel;

            // Mirror the payment_status convention used by the rest of the
            // codebase. PAID when fully collected, PARTIAL otherwise. The
            // freeform string column lives on for backward compat — we just
            // write a canonical value into it so reports stay consistent.
            const total = Number(order.total) || 0;
            const PRICE_EPSILON = 0.01;
            const fullyPaid = total > 0 && amount + PRICE_EPSILON >= total;
            updateData.payment_status = fullyPaid ? 'PAID' : 'PARTIAL';

            const updated = await strapi.documents('api::sale-order.sale-order').update({
                documentId,
                data: updateData,
                populate: ['payment_collected_by_rider', 'payment_verified_by'],
            });

            // Auto-advance the order state if a full COD/cash payment is
            // recorded against an unpaid order. We only push PENDING_PAYMENT
            // forward — every other status stays as-is so we don't
            // accidentally unwind a manual fulfillment step.
            if (fullyPaid && order.order_status === 'PENDING_PAYMENT') {
                try {
                    await stateMachine.executeTransition(documentId, 'PAYMENT_CONFIRMED', {});
                    notificationService.send('payment_confirmed', documentId).catch(() => {});
                } catch (err) {
                    strapi.log.warn(`[order] recordPayment auto-transition failed: ${err.message}`);
                }
            }

            return ctx.send({ data: updated });
        },

        // ── POST /sale-orders/:documentId/verify-payment ─────────────────────
        // Used by the accounts team to confirm that a recorded COD payment
        // has actually arrived (cash dropped at the desk / bank deposit
        // cleared / wallet transaction matched). Sets the verifier + the
        // timestamp; does NOT touch the order_status state machine — by
        // verification time the order is typically already DELIVERED.
        async verifyPayment(ctx) {
            const user = await ensureUser(ctx, strapi);
            if (!user) return;
            // TODO: tighten to a dedicated 'rutba_accountant_user' role once
            // that exists. For now any staff user can verify — the audit log
            // (payment_verified_by + payment_verified_at) is the safety net.
            const staff = await requireStaffUser(ctx, strapi, user);
            if (!staff) return;
            const { documentId } = ctx.params;
            const { status, notes } = readBody(ctx);

            const ALLOWED = ['verified', 'disputed', 'unverified'];
            if (!status || !ALLOWED.includes(status)) {
                return ctx.badRequest(`status must be one of: ${ALLOWED.join(', ')}`);
            }

            const order = await strapi.documents('api::sale-order.sale-order').findOne({
                documentId,
                fields: ['id', 'order_id', 'paid_amount', 'payment_method'],
            });
            if (!order) return ctx.notFound('Order not found');
            if (status === 'verified' && (Number(order.paid_amount) || 0) <= 0) {
                return ctx.badRequest('Cannot verify a payment with paid_amount = 0 — record the payment first.');
            }

            const updated = await strapi.documents('api::sale-order.sale-order').update({
                documentId,
                data: {
                    payment_verification_status: status,
                    payment_verification_notes: notes || null,
                    // 'verified' / 'disputed' both stamp who acted; 'unverified'
                    // (rolling back a previous verification) clears the audit.
                    payment_verified_at: status === 'unverified' ? null : new Date(),
                    payment_verified_by: status === 'unverified' ? null : { id: user.id },
                },
                populate: ['payment_collected_by_rider', 'payment_verified_by'],
            });

            // COD settlement: when accounts confirm the rider's cash, move it from
            // the rider-float clearing account to the bank. COD only — prepaid
            // orders already debited the bank at delivery. Best-effort + idempotent.
            if (status === 'verified' && order.payment_method === 'cod' && Number(order.paid_amount) > 0) {
                try {
                    const accounting = strapi.service('api::acc-journal-entry.accounting');
                    const resolver = strapi.service('api::acc-journal-entry.account-resolver');
                    const already = await accounting.findBySource('Web Order Payment', order.id);
                    if (!already || already.length === 0) {
                        const amt = Number(order.paid_amount);
                        await accounting.createAndPost({
                            date: new Date(),
                            description: `COD settlement — Web Order ${order.order_id || order.id}`,
                            source_type: 'Web Order Payment',
                            source_id: order.id,
                            source_ref: order.order_id || String(order.id),
                            lines: [
                                { account: await resolver.resolve('BANK_PRIMARY', null), debit: amt, credit: 0, description: 'COD cash banked' },
                                { account: await resolver.resolve('COD_CLEARING', null), debit: 0, credit: amt, description: 'Clear rider float' },
                            ],
                            posted_by: user?.email || '',
                        });
                    }
                } catch (err) {
                    strapi.log.error(`[order verifyPayment] COD settlement failed for ${documentId}: ${err.message}`);
                }
            }

            return ctx.send({ data: updated });
        },

        // ── POST /sale-orders/:documentId/request-cost-change-ack ───────────
        //
        // Staff has changed items / total on an already-confirmed order;
        // stamp pending_cost_change + dispatch the customer approval email.
        // Idempotent on resend: the same {newTotal} keeps the existing token
        // so any in-flight email links stay valid.
        //
        // Body: { old_total, new_total, reason? }
        async requestCostChangeAck(ctx) {
            const user = await ensureUser(ctx, strapi);
            if (!user) return;
            const staff = await requireStaffUser(ctx, strapi, user);
            if (!staff) return;

            const { documentId } = ctx.params;
            const { old_total, new_total, reason } = readBody(ctx);

            if (!Number.isFinite(Number(new_total))) {
                return ctx.badRequest('new_total (number) is required');
            }

            const pendingChangeService = require('../services/pending-change-service');
            try {
                const out = await pendingChangeService.requestAck({
                    documentId,
                    oldTotal: Number(old_total) || 0,
                    newTotal: Number(new_total),
                    reason,
                    requestedBy: staff,
                });
                return ctx.send({ data: out });
            } catch (err) {
                ctx.status = err.status || 500;
                ctx.body = { error: { message: err.message } };
                return;
            }
        },

        // ── POST /sale-orders/:documentId/override-cost-change-ack ──────────
        //
        // Staff records that the customer agreed out-of-band (phone, in-person,
        // etc.). Clears pending_cost_change and stamps the audit fields.
        //
        // Body: { via, notes? }   via ∈ phone|whatsapp|in_person|email
        async overrideCostChangeAck(ctx) {
            const user = await ensureUser(ctx, strapi);
            if (!user) return;
            const staff = await requireStaffUser(ctx, strapi, user);
            if (!staff) return;

            const { documentId } = ctx.params;
            const { via, notes } = readBody(ctx);

            const pendingChangeService = require('../services/pending-change-service');
            try {
                const updated = await pendingChangeService.overrideAck({
                    documentId,
                    via,
                    notes,
                    actor: staff,
                });
                return ctx.send({ data: updated });
            } catch (err) {
                ctx.status = err.status || 500;
                ctx.body = { error: { message: err.message } };
                return;
            }
        },

        // ── POST /sale-orders/confirm-change ───────────────────────────────
        //
        // Public, token-authenticated route. The customer's approval email
        // links here with ?token=<ack_token>. Single-use: consuming a token
        // burns it so a replayed link can't move the order twice.
        //
        // Auth: no JWT required — the token IS the auth. We accept the token
        // via body OR query so a GET landing page can also confirm with a
        // single click without prompting (storefront page typically POSTs).
        async confirmCostChange(ctx) {
            const tokenFromBody  = readBody(ctx)?.token;
            const tokenFromQuery = ctx.query?.token;
            const token = tokenFromBody || tokenFromQuery;

            const pendingChangeService = require('../services/pending-change-service');
            try {
                const updated = await pendingChangeService.ackByToken(token);
                return ctx.send({
                    data: {
                        order_id: updated.order_id,
                        documentId: updated.documentId,
                        acked: true,
                    },
                });
            } catch (err) {
                ctx.status = err.status || 500;
                ctx.body = { error: { message: err.message } };
                return;
            }
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
            const { message } = readBody(ctx);
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

            // Deep-populate items + their first image so the storefront's
            // /profile/orders list can render a thumbnail per card. Also keeps
            // the order-management list page consistent with the detail page.
            const orders = await strapi.documents('api::sale-order.sale-order').findMany({
                filters: mergedFilters,
                sort: ctx.query.sort || 'createdAt:desc',
                populate: {
                    customer_person: true,
                    delivery_address: true,
                    delivery_method: true,
                    assigned_rider: true,
                    delivery_zone: true,
                    products: {
                        populate: {
                            items: {
                                populate: {
                                    image: true,
                                    product: { fields: ['documentId', 'name'] },
                                },
                            },
                        },
                    },
                },
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
            // Deep-populate the line items + their image + product fields.
            // The previous shallow `['products']` populate only filled the
            // parent component — `products.items` came back undefined, so the
            // order-management detail page rendered an empty placeholder row
            // even though the order had line items in the DB. Also populate
            // payment_collected_by_rider for the Payment card on that page.
            const order = await strapi.documents('api::sale-order.sale-order').findOne({
                documentId,
                populate: {
                    customer_person: true,
                    delivery_address: true,
                    owners: true,
                    delivery_method: true,
                    delivery_zone: true,
                    assigned_rider: true,
                    payment_collected_by_rider: true,
                    products: {
                        populate: {
                            items: {
                                populate: {
                                    image: true,
                                    product: { fields: ['documentId', 'name'] },
                                    // Attached stock-unit for fulfillment. Fields
                                    // listed explicitly so we don't accidentally
                                    // leak cost_price etc. to non-staff callers
                                    // — order-management uses sku/barcode/name
                                    // to identify the unit + status to show
                                    // whether it's still Reserved or already
                                    // moved on.
                                    stock_item: {
                                        fields: ['documentId', 'sku', 'barcode', 'name', 'status'],
                                    },
                                },
                            },
                        },
                    },
                },
            });
            if (!order) return ctx.notFound('Order not found');
            // Ownership check only for storefront users — staff (rutba_app_user)
            // can view any order, that's the whole point of order-management.
            // `authenticated` is the default role assigned by users-permissions
            // for fresh signups before they're upgraded to rutba_web_user, so
            // those still get the ownership filter applied for safety.
            if (accessUser.role?.type === 'rutba_web_user' || accessUser.role?.type === 'authenticated') {
                const isOwner = (order.owners || []).some((o) => o.id === user.id);
                if (!isOwner) return ctx.forbidden('You can only view your own orders.');
            }
            delete order.owners;
            ctx.send({ data: order });
        },

        // ── GET /sale-orders/:documentId/label ─────────────────────────────
        //
        // Provider-specific shipping label. Dispatches via the label-providers
        // registry, keyed off delivery_method.service_provider:
        //   - own_rider → 4×6 thermal PDF (pdfkit, in-house template)
        //   - easypost  → 302 to carrier's hosted label URL
        //   - custom    → courier-agnostic pick slip PDF
        //
        // Cache: result url stamped on order.label_url + label_generated_at.
        // For PDF providers we serve fresh bytes on every request (the bytes
        // aren't stored — only the marker that "a label was issued at T"),
        // which makes reprints free. ?reprint=1 also restamps the generation
        // time so audit trails show the reissue.
        //
        // Auth: same auth:false + requireStaffUser pattern as update-status.
        async getLabel(ctx) {
            const user  = await ensureUser(ctx, strapi);
            if (!user) return;
            const staff = await requireStaffUser(ctx, strapi, user);
            if (!staff) return;
            return dispatchLabel(ctx, strapi, { returnMode: false });
        },

        // ── GET /sale-orders/:documentId/return-label ──────────────────────
        //
        // Return-mode label. Same registry, same providers, swaps ship-to with
        // return-to (warehouse) and stamps the return_ref in the header. For
        // own_rider this is the pickup slip the rider takes to the customer;
        // for custom this is the internal slip the warehouse uses to identify
        // a parcel a third-party courier drops without our paperwork.
        async getReturnLabel(ctx) {
            const user  = await ensureUser(ctx, strapi);
            if (!user) return;
            const staff = await requireStaffUser(ctx, strapi, user);
            if (!staff) return;
            return dispatchLabel(ctx, strapi, { returnMode: true });
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
