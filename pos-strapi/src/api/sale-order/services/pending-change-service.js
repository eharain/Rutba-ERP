'use strict';

/**
 * Pending-change service
 *
 * Owns the `pending_cost_change` field on sale-orders. The field's lifecycle:
 *
 *   request → email sent → customer clicks → ack stamped → cleared
 *                     ↘ staff overrides via phone → ack stamped → cleared
 *
 * The JSON column stores:
 *   {
 *     old_total, new_total, reason,
 *     requested_at, requested_by,                      // staff audit
 *     ack_required: true,
 *     ack_token,                                       // unique nonce
 *     ack_url,                                         // pre-built confirm URL
 *     last_email_sent_at,                              // for resend cooldown
 *     acked_at, acked_by, acked_via,                   // 'email' | 'phone' | …
 *     ack_notes,
 *   }
 *
 * The UI gates VerificationStage's "Start Packaging" + PreparationStage's
 * "Ready for Pickup" on `ack_required && !acked_at` — see CostChangeBanner.
 */

const crypto = require('crypto');

const ORDER_UID = 'api::sale-order.sale-order';

/**
 * Compute the storefront-facing confirm URL for a token. Lives here so the
 * email body and the public-route response speak about the same URL shape.
 */
function buildConfirmUrl(token) {
    const base = process.env.FRONTEND_URL || 'https://rutba.pk';
    return `${base.replace(/\/$/, '')}/orders/confirm-change?token=${encodeURIComponent(token)}`;
}

/**
 * 256-bit URL-safe token. Stored alongside the order so the public confirm
 * route can look up the order without a JWT; rotated on every fresh request.
 */
function newToken() {
    return crypto.randomBytes(32).toString('base64url');
}

module.exports = {
    buildConfirmUrl,

    /**
     * Stamp pending_cost_change on the order and dispatch the approval email.
     *
     * Called from the controller when:
     *   - staff edits items/total post-confirm (server detects delta)
     *   - staff hits "Resend approval" on the banner
     *
     * Idempotent on resend: a request with the same {newTotal, items signature}
     * as the current pending change keeps the token (so older email links
     * stay valid) but refreshes `last_email_sent_at`.
     *
     * @param {object} args
     * @param {string} args.documentId       order documentId
     * @param {number} args.oldTotal
     * @param {number} args.newTotal
     * @param {string} [args.reason]
     * @param {object} [args.requestedBy]    UP user (id, email/username)
     * @returns {Promise<{ token: string, confirmUrl: string, resend: boolean }>}
     */
    async requestAck({ documentId, oldTotal, newTotal, reason, requestedBy }) {
        const order = await strapi.documents(ORDER_UID).findOne({
            documentId,
            fields: ['id', 'order_id', 'pending_cost_change'],
            populate: ['customer_person', 'delivery_method', 'products'],
        });
        if (!order) {
            const err = new Error(`Order ${documentId} not found`);
            err.status = 404;
            throw err;
        }

        // Reuse the token on resends so older email links don't 404. Only
        // mint a fresh one when the totals actually differ from what's on
        // file (i.e. staff made a second adjustment).
        const existing = order.pending_cost_change && typeof order.pending_cost_change === 'object'
            ? order.pending_cost_change
            : null;
        const sameAsExisting = existing
            && !existing.acked_at
            && Number(existing.new_total) === Number(newTotal);

        const token = sameAsExisting ? existing.ack_token : newToken();
        const confirmUrl = buildConfirmUrl(token);
        const now = new Date();

        const pending = {
            old_total: Number(oldTotal) || 0,
            new_total: Number(newTotal) || 0,
            reason: reason || existing?.reason || null,
            requested_at: sameAsExisting ? (existing.requested_at || now) : now,
            requested_by: requestedBy
                ? { id: requestedBy.id, email: requestedBy.email, username: requestedBy.username }
                : (sameAsExisting ? existing.requested_by : null),
            ack_required: true,
            ack_token: token,
            ack_url: confirmUrl,
            last_email_sent_at: now,
            acked_at: null,
            acked_by: null,
            acked_via: null,
            ack_notes: null,
        };

        await strapi.documents(ORDER_UID).update({
            documentId,
            data: { pending_cost_change: pending },
        });

        // Best-effort email. If the notification template isn't seeded yet or
        // the SMTP transport fails, surface a warning but don't unwind the
        // pending-change stamp — staff can still override-by-phone.
        try {
            const notificationService = require('./notification-service');
            await notificationService.send('cost_change_approval', documentId, {
                old_total: `Rs. ${Number(oldTotal || 0).toFixed(0)}`,
                new_total: `Rs. ${Number(newTotal || 0).toFixed(0)}`,
                change_reason: reason || '(no reason given)',
                confirm_url: confirmUrl,
                change_requested_at: now.toLocaleString('en-PK'),
            });
        } catch (err) {
            strapi.log.warn(`[pending-change-service] notification send failed: ${err.message}`);
        }

        return { token, confirmUrl, resend: Boolean(sameAsExisting) };
    },

    /**
     * Mark pending_cost_change as acknowledged by the customer's email click.
     *
     * Single-use: a token that doesn't match (or matches an already-acked
     * change) is rejected so a replayed link can't move the order again.
     *
     * @param {string} token
     * @returns {Promise<object>} updated order
     */
    async ackByToken(token) {
        if (!token) {
            const err = new Error('Token is required');
            err.status = 400;
            throw err;
        }

        // We don't index ack_token (it's inside a JSON column), so scan the
        // small set of currently-pending orders. Expected cardinality is
        // low (orders waiting on customer approval); if this grows large
        // enough to matter we'd lift ack_token to a top-level column.
        const candidates = await strapi.documents(ORDER_UID).findMany({
            filters: { pending_cost_change: { $notNull: true } },
            fields: ['id', 'order_id', 'pending_cost_change'],
            pagination: { pageSize: 500 },
        });

        const match = (candidates || []).find((o) => {
            const p = o.pending_cost_change;
            return p && typeof p === 'object'
                && p.ack_token === token
                && !p.acked_at
                && p.ack_required !== false;
        });

        if (!match) {
            const err = new Error('Token is invalid or has already been used.');
            err.status = 410; // gone — token consumed or expired
            throw err;
        }

        const acked = {
            ...match.pending_cost_change,
            acked_at: new Date(),
            acked_via: 'email',
            acked_by: null, // customer-side click; no UP user attached
            ack_token: null, // burn the token
        };

        return strapi.documents(ORDER_UID).update({
            documentId: match.documentId,
            data: { pending_cost_change: acked },
        });
    },

    /**
     * Staff override — record that they got verbal/written approval out-of-band
     * (phone, walk-in, etc.) and clear the pending state.
     *
     * @param {object} args
     * @param {string} args.documentId
     * @param {string} args.via       'phone' | 'whatsapp' | 'in_person' | 'email'
     * @param {string} [args.notes]
     * @param {object} args.actor     UP user
     */
    async overrideAck({ documentId, via, notes, actor }) {
        const ALLOWED = ['phone', 'whatsapp', 'in_person', 'email'];
        if (!ALLOWED.includes(via)) {
            const err = new Error(`via must be one of: ${ALLOWED.join(', ')}`);
            err.status = 400;
            throw err;
        }

        const order = await strapi.documents(ORDER_UID).findOne({
            documentId,
            fields: ['id', 'pending_cost_change'],
        });
        if (!order) {
            const err = new Error('Order not found');
            err.status = 404;
            throw err;
        }
        if (!order.pending_cost_change || order.pending_cost_change.acked_at) {
            const err = new Error('Order has no outstanding cost change to override');
            err.status = 409;
            throw err;
        }

        const acked = {
            ...order.pending_cost_change,
            acked_at: new Date(),
            acked_via: via,
            acked_by: actor
                ? { id: actor.id, email: actor.email, username: actor.username }
                : null,
            ack_notes: notes || null,
            ack_token: null, // burn the token so the email link can't also fire
        };

        return strapi.documents(ORDER_UID).update({
            documentId,
            data: { pending_cost_change: acked },
        });
    },
};
