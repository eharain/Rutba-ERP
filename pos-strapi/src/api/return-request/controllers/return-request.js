'use strict';

/**
 * return-request controller
 *
 * Customer-facing actions (createReturnRequest, listMine, findMine,
 * cancelMine) authenticate the buyer via ensureUser and gate by `owners`
 * membership. Staff actions (approveReturn, rejectReturn, setReceived,
 * resolveReturn, list/find) reuse the requireStaffUser pattern from
 * sale-order so the same `auth: false` route convention applies.
 *
 * Side effects (stock-item walk, notification send) are delegated:
 *   - state walks → return-state-machine service
 *   - emails      → sale-order notification-service (same template engine,
 *                   new trigger_event values for return_* phases)
 */

const { factories } = require('@strapi/strapi');
const { ensureUser } = require('../../../utils/ensure-user');
const stateMachine = require('../services/return-state-machine');
const orderStateMachine = require('../../sale-order/services/sale-order-state-machine');
const notificationService = require('../../sale-order/services/notification-service');
const labelProviders = require('../../sale-order/services/label-providers');

const RETURN_UID = 'api::return-request.return-request';
const ORDER_UID  = 'api::sale-order.sale-order';

async function loadFullUser(strapi, user) {
    return strapi.query('plugin::users-permissions.user').findOne({
        where: { id: user.id },
        populate: { role: { select: ['type'] } },
    });
}

async function requireStaffUser(ctx, strapi, user) {
    const full = await loadFullUser(strapi, user);
    const roleType = full?.role?.type;
    const allowed = roleType === 'rutba_app_user' || roleType === 'authenticated';
    if (!full || !allowed) {
        ctx.forbidden('Only staff users can manage returns.');
        return null;
    }
    return full;
}

async function loadReturnWithOwners(strapi, documentId) {
    return strapi.documents(RETURN_UID).findOne({
        documentId,
        populate: { owners: { fields: ['id'] }, sale_order: { fields: ['id', 'documentId', 'order_id'] } },
    });
}

function isOwner(ret, user) {
    return (ret?.owners || []).some((o) => o.id === user.id);
}

module.exports = factories.createCoreController(RETURN_UID, ({ strapi }) => ({

    // ── POST /return-requests ── customer creates ─────────────────────────
    //
    // Body: {
    //   sale_order_document_id, reason, reason_notes?, resolution?,
    //   items: [{ order_line_index, quantity, reason?, reason_notes?, unit_refund_paisa? }, …],
    //   customer_evidence?: media-ids[]
    // }
    //
    // Eligibility: order must be DELIVERED + within the policy window, and
    // the caller must be in the order's `owners` (or staff acting on behalf).
    async createReturnRequest(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;

        const body = ctx.request.body?.data || ctx.request.body || {};
        const {
            sale_order_document_id,
            reason,
            reason_notes,
            resolution = 'refund',
            items = [],
            customer_evidence,
        } = body;

        if (!sale_order_document_id) return ctx.badRequest('sale_order_document_id is required');
        if (!reason)                  return ctx.badRequest('reason is required');
        if (!Array.isArray(items) || items.length === 0) return ctx.badRequest('At least one return item is required');

        // Pull the order — need owners, status, delivery time, and the
        // products component so we can mirror line index → product copy
        // onto the return-line for resilience after edits / cancellations.
        const order = await strapi.documents(ORDER_UID).findOne({
            documentId: sale_order_document_id,
            populate: {
                owners: { fields: ['id'] },
                products: { populate: { items: { populate: { product: { fields: ['id', 'documentId', 'non_returnable'] }, stock_item: { fields: ['documentId'] } } } } },
            },
        });
        if (!order) return ctx.notFound('Sale order not found');

        // Ownership check — buyer or staff
        const full = await loadFullUser(strapi, user);
        const isStaff = full?.role?.type === 'rutba_app_user' || full?.role?.type === 'authenticated';
        const owner = (order.owners || []).some((o) => o.id === user.id);
        if (!owner && !isStaff) return ctx.forbidden('You cannot request a return on this order');

        // Window check via policy service
        const policySvc = strapi.service('api::return-policy.return-policy');
        const window = await policySvc.checkWindow(order);
        if (!window.eligible && !isStaff) {
            return ctx.badRequest(`Return window expired or order not eligible (${window.reason})`, { window });
        }

        // Validate each line against the order, copy product info + stock-item link
        const orderLines = order.products?.items || [];
        const returnLines = [];
        for (const it of items) {
            const idx = it.order_line_index;
            if (typeof idx !== 'number' || idx < 0 || idx >= orderLines.length) {
                return ctx.badRequest(`order_line_index ${idx} out of range`);
            }
            const orderLine = orderLines[idx];
            if (orderLine.product?.non_returnable) {
                return ctx.badRequest(`Line ${idx} (${orderLine.product_name || 'item'}) is non-returnable`);
            }
            const qty = Number(it.quantity) || 1;
            if (qty < 1 || qty > (orderLine.quantity || 1)) {
                return ctx.badRequest(`Line ${idx} quantity ${qty} exceeds purchased ${orderLine.quantity}`);
            }
            // Default unit refund = original line price (variant_price already
            // resolved at order time). Caller may override.
            const unitPaisa = Number.isFinite(Number(it.unit_refund_paisa))
                ? Number(it.unit_refund_paisa)
                : Math.round(Number(orderLine.price || 0) * 100);
            returnLines.push({
                order_line_index: idx,
                product:          orderLine.product?.documentId || null,
                product_name:     orderLine.product_name || null,
                variant_name:     orderLine.variant_name || null,
                quantity:         qty,
                unit_refund_paisa: unitPaisa,
                reason:           it.reason || reason,
                reason_notes:     it.reason_notes || null,
                restock_decision: 'back_to_inventory',
                stock_item:       orderLine.stock_item?.documentId || null,
            });
        }

        const refundAmountPaisa = returnLines.reduce((sum, l) => sum + (Number(l.unit_refund_paisa) || 0) * (l.quantity || 1), 0);

        try {
            const created = await strapi.documents(RETURN_UID).create({
                data: {
                    sale_order:           sale_order_document_id,
                    status:               'REQUESTED',
                    reason,
                    reason_notes,
                    resolution,
                    items:                returnLines,
                    customer_evidence,
                    refund_amount_paisa:  refundAmountPaisa,
                    refund_status:        'pending_manual',
                    owners:               (order.owners || []).map((o) => o.id),
                },
                populate: { items: true, sale_order: { fields: ['documentId', 'order_id'] } },
            });

            // Push the parent order from DELIVERED → RETURN_REQUESTED so the
            // order-management shell renders the ReturnStage panel. Best-effort:
            // if the order has been manually cancelled or already advanced, the
            // state machine throws and we log it — the return itself is still
            // valid and a staff user can adjust the order state manually.
            try {
                await orderStateMachine.executeTransition(sale_order_document_id, 'RETURN_REQUESTED', {});
            } catch (err) {
                strapi.log.info(`[return-request] order state mirror skipped: ${err.message}`);
            }

            notificationService.send('return_requested', sale_order_document_id, { return_ref: created.return_ref }).catch(() => {});
            return ctx.send({ data: created });
        } catch (err) {
            strapi.log.error(`[return-request] create failed: ${err.message}`);
            return ctx.badRequest(err.message);
        }
    },

    // ── GET /return-requests/mine ── customer's own returns ───────────────
    async listMine(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const rows = await strapi.documents(RETURN_UID).findMany({
            filters: { owners: { id: { $eq: user.id } } },
            sort:    ['createdAt:desc'],
            populate: {
                sale_order: { fields: ['documentId', 'order_id', 'order_status', 'actual_delivery_time'] },
                items:      true,
            },
        });
        return ctx.send({ data: rows });
    },

    // ── GET /return-requests/:documentId ── customer or staff ─────────────
    async findOneScoped(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const { documentId } = ctx.params;
        const ret = await strapi.documents(RETURN_UID).findOne({
            documentId,
            populate: {
                owners:     { fields: ['id'] },
                sale_order: { fields: ['documentId', 'order_id', 'order_status', 'actual_delivery_time'] },
                items:      { populate: { product: { fields: ['documentId', 'name', 'slug'] }, stock_item: { fields: ['documentId', 'status'] } } },
                customer_evidence: { fields: ['url', 'name', 'mime'] },
                approved_by: { fields: ['id', 'username', 'email'] },
                received_by: { fields: ['id', 'username', 'email'] },
            },
        });
        if (!ret) return ctx.notFound('Return not found');
        const full = await loadFullUser(strapi, user);
        const isStaff = full?.role?.type === 'rutba_app_user' || full?.role?.type === 'authenticated';
        if (!isStaff && !isOwner(ret, user)) return ctx.forbidden('You cannot view this return');
        return ctx.send({ data: ret });
    },

    // ── POST /return-requests/:documentId/cancel ── customer or staff ─────
    async cancelReturn(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const { documentId } = ctx.params;
        const ret = await loadReturnWithOwners(strapi, documentId);
        if (!ret) return ctx.notFound('Return not found');
        const full = await loadFullUser(strapi, user);
        const isStaff = full?.role?.type === 'rutba_app_user' || full?.role?.type === 'authenticated';
        if (!isStaff && !isOwner(ret, user)) return ctx.forbidden('You cannot cancel this return');
        try {
            const updated = await stateMachine.executeTransition(documentId, 'CANCELLED', {});
            return ctx.send({ data: updated });
        } catch (err) {
            return ctx.badRequest(err.message);
        }
    },

    // ── POST /return-requests/:documentId/approve ── staff ────────────────
    async approveReturn(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const staff = await requireStaffUser(ctx, strapi, user);
        if (!staff) return;
        const { documentId } = ctx.params;
        const { pickup_method, pickup_scheduled_at, notes } = ctx.request.body || {};
        try {
            const updated = await stateMachine.executeTransition(documentId, 'APPROVED', {
                approved_by: staff.id,
                approved_at: new Date(),
                ...(pickup_method ? { pickup_method } : {}),
                ...(pickup_scheduled_at ? { pickup_scheduled_at } : {}),
                ...(notes ? { refund_notes: notes } : {}),
            });
            const ret = await loadReturnWithOwners(strapi, documentId);
            const orderDocId = ret?.sale_order?.documentId;
            if (orderDocId) notificationService.send('return_approved', orderDocId, { return_ref: updated.return_ref }).catch(() => {});
            return ctx.send({ data: updated });
        } catch (err) {
            return ctx.badRequest(err.message);
        }
    },

    // ── POST /return-requests/:documentId/reject ── staff ─────────────────
    async rejectReturn(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const staff = await requireStaffUser(ctx, strapi, user);
        if (!staff) return;
        const { documentId } = ctx.params;
        const { rejection_reason } = ctx.request.body || {};
        if (!rejection_reason) return ctx.badRequest('rejection_reason is required');
        try {
            const updated = await stateMachine.executeTransition(documentId, 'REJECTED', {
                rejection_reason,
                approved_by: staff.id,
                approved_at: new Date(),
            });
            const ret = await loadReturnWithOwners(strapi, documentId);
            const orderDocId = ret?.sale_order?.documentId;
            if (orderDocId) notificationService.send('return_rejected', orderDocId, { return_ref: updated.return_ref, rejection_reason }).catch(() => {});
            return ctx.send({ data: updated });
        } catch (err) {
            return ctx.badRequest(err.message);
        }
    },

    // ── POST /return-requests/:documentId/set-received ── staff ────────────
    //
    // Body: { item_decisions?: [{ order_line_index, restock_decision, inspection_notes? }, …] }
    //
    // Applies per-line restock decisions (defaults already set at create time),
    // then walks attached stock-items Sold → InStock | ReturnedDamaged via the
    // state machine. Mirrors sale-order attachStockItem + state-machine pattern.
    async setReceived(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const staff = await requireStaffUser(ctx, strapi, user);
        if (!staff) return;
        const { documentId } = ctx.params;
        const { item_decisions = [] } = ctx.request.body || {};

        // Patch per-line decisions if provided. Strapi components replace
        // wholesale on update, so load → mutate → write.
        if (Array.isArray(item_decisions) && item_decisions.length > 0) {
            const current = await strapi.documents(RETURN_UID).findOne({
                documentId,
                populate: { items: true },
            });
            if (!current) return ctx.notFound('Return not found');
            const byIdx = new Map(item_decisions.map((d) => [d.order_line_index, d]));
            const patchedItems = (current.items || []).map((line) => {
                const decision = byIdx.get(line.order_line_index);
                if (!decision) return line;
                return {
                    ...line,
                    restock_decision: decision.restock_decision || line.restock_decision,
                    inspection_notes: decision.inspection_notes ?? line.inspection_notes,
                };
            });
            await strapi.documents(RETURN_UID).update({
                documentId,
                data: { items: patchedItems },
            });
        }

        try {
            const updated = await stateMachine.executeTransition(documentId, 'RECEIVED', {
                received_by: staff.id,
            });
            const ret = await loadReturnWithOwners(strapi, documentId);
            const orderDocId = ret?.sale_order?.documentId;
            if (orderDocId) notificationService.send('return_received', orderDocId, { return_ref: updated.return_ref }).catch(() => {});
            return ctx.send({ data: updated });
        } catch (err) {
            return ctx.badRequest(err.message);
        }
    },

    // ── GET /return-requests/:documentId/label ── staff ───────────────────
    //
    // Resolve which provider's return-label template the client should
    // render. JSON-only, mirroring /sale-orders/:id/return-label. Provider
    // selection: return_method.service_provider when set, otherwise the
    // parent order's delivery_method.service_provider.
    async getReturnLabel(ctx) {
        const user  = await ensureUser(ctx, strapi);
        if (!user) return;
        const staff = await requireStaffUser(ctx, strapi, user);
        if (!staff) return;

        const { documentId } = ctx.params;
        const reprint = String(ctx.query.reprint || '') === '1';

        const ret = await strapi.documents(RETURN_UID).findOne({
            documentId,
            populate: {
                return_method: true,
                sale_order: { populate: { delivery_method: true } },
            },
        });
        if (!ret) return ctx.notFound('Return not found');
        if (!ret.sale_order) return ctx.badRequest('Return is detached from its sale-order');

        const orderForLabel = { ...ret.sale_order };
        if (ret.return_method?.service_provider) {
            orderForLabel.delivery_method = {
                ...(orderForLabel.delivery_method || {}),
                service_provider: ret.return_method.service_provider,
            };
        }
        orderForLabel.return_label_url = ret.return_label_url;

        let result;
        try {
            result = await labelProviders.generateReturn(orderForLabel, { returnRef: ret.return_ref });
        } catch (err) {
            strapi.log.warn(`[return-label] provider failed for return=${documentId}: ${err.message}`);
            ctx.status = err.status || 500;
            ctx.body = { error: { message: err.message } };
            return;
        }

        const cacheValue = result.kind === 'url'
            ? result.url
            : `html:${result.provider}`;

        if (reprint || !ret.return_label_url || !ret.return_label_generated_at) {
            try {
                await strapi.documents(RETURN_UID).update({
                    documentId,
                    data: {
                        return_label_url: cacheValue,
                        return_label_generated_at: new Date(),
                    },
                });
            } catch (err) {
                strapi.log.warn(`[return-label] cache stamp failed: ${err.message}`);
            }
        }

        ctx.body = { data: { ...result, return_ref: ret.return_ref } };
    },

    // ── POST /return-requests/:documentId/resolve ── staff ─────────────────
    //
    // Closes the return: records refund details + transitions to COMPLETED.
    // For MVP refund_status defaults to `pending_manual` (accounts processes
    // by hand). Set `refund_status: 'completed'` when accounts has paid out.
    async resolveReturn(ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;
        const staff = await requireStaffUser(ctx, strapi, user);
        if (!staff) return;
        const { documentId } = ctx.params;
        const {
            refund_amount_paisa,
            refund_method,
            refund_status = 'pending_manual',
            refund_notes,
        } = ctx.request.body || {};

        const extra = {};
        if (refund_amount_paisa != null) extra.refund_amount_paisa = Number(refund_amount_paisa);
        if (refund_method)               extra.refund_method = refund_method;
        if (refund_status)               extra.refund_status = refund_status;
        if (refund_notes)                extra.refund_notes  = refund_notes;

        try {
            const updated = await stateMachine.executeTransition(documentId, 'COMPLETED', extra);
            const ret = await loadReturnWithOwners(strapi, documentId);
            const orderDocId = ret?.sale_order?.documentId;
            if (orderDocId) notificationService.send('return_completed', orderDocId, { return_ref: updated.return_ref, refund_status }).catch(() => {});
            return ctx.send({ data: updated });
        } catch (err) {
            return ctx.badRequest(err.message);
        }
    },

}));
