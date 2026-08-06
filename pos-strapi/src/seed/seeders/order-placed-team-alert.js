'use strict';

/**
 * Internal "new order placed" alert for the order management team.
 *
 * Shared idempotent body used by BOTH:
 *   - database/migrations/2026.08.04T00.00.00.order-placed-team-alert.js
 *   - the seed registry (on-demand re-run from the CLI / control app)
 *
 * The customer already gets "Order Confirmed (Buyer)" on the same trigger.
 * This is the operations-side counterpart: the moment a web order lands,
 * whoever staffs order management gets a mail with everything needed to start
 * picking, so nobody has to sit refreshing the orders board.
 *
 * Recipient: send_to='staff' resolves in sale-order/services/notification-service
 * to ORDER_ALERT_EMAIL (falling back to EMAIL_FROM). Set ORDER_ALERT_EMAIL to
 * the team's address — a comma-separated list works, both servers pass it
 * through to nodemailer, which splits it.
 *
 * NOT sent for POS counter sales: those create `sale` rows, and the
 * order_placed trigger only fires from the storefront checkout
 * (sale-order/controllers/sale-order.js createOrder). Staff ring those up in
 * person, so there is nothing to alert them about.
 *
 * Idempotent: inserts only when no row with this name exists, so the team can
 * edit the subject/body freely without it being clobbered on the next boot.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<{created:number, skipped:number}>}
 */
const { generateDocumentId } = require('./hr-notification-templates');

async function applyOrderPlacedTeamAlert(knex) {
    const tableExists = await knex.schema.hasTable('notification_templates');
    if (!tableExists) return { created: 0, skipped: 0 };

    const name = 'New Order Placed (Order Management Team)';
    const existing = await knex('notification_templates').where({ name }).limit(1);
    if (existing.length > 0) {
        // A row is unusable as a relation target if document_id is NULL, or if
        // it starts with a digit (Strapi coerces a numeric-looking documentId to
        // an integer, so the link truncates or resolves to nothing). Either way
        // processEvent throws "Invalid relations" and the alert is silently
        // never delivered.
        const docId = existing[0].document_id;
        if (docId == null || /^[0-9]/.test(String(docId))) {
            await knex('notification_templates')
                .where({ id: existing[0].id })
                .update({ document_id: generateDocumentId() });
            return { created: 0, skipped: 0, repaired: 1 };
        }
        return { created: 0, skipped: 1 };
    }

    const now = new Date();
    await knex('notification_templates').insert({
        document_id: generateDocumentId(),
        name,
        event_name: 'order.placed.internal',
        trigger_event: 'order_placed',
        category: 'orders_payments',
        priority: 'high',
        audience: 'admin',
        is_critical: false,
        send_email: true,
        // JSON column on Postgres / longtext on MySQL — serialise so both
        // engines store it the same way.
        channels: JSON.stringify(['email']),
        channel: 'email',
        delay_minutes: 0,
        // One alert per order. The buyer-facing template dedups on its own key;
        // this row keys off the same order id, so a retried checkout callback
        // cannot double-page the team.
        dedup_window_minutes: 60,
        subject: 'New order {{order_id}} — {{total}}',
        body_template: [
            '<p><strong>A new order just came in.</strong></p>',
            '<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">',
            '<tr><td><strong>Order</strong></td><td>{{order_id}}</td></tr>',
            '<tr><td><strong>Status</strong></td><td>{{order_status}}</td></tr>',
            '<tr><td><strong>Total</strong></td><td>{{total}}</td></tr>',
            '<tr><td><strong>Items</strong></td><td>{{items_summary}}</td></tr>',
            '<tr><td><strong>Customer</strong></td><td>{{customer_name}}</td></tr>',
            '<tr><td><strong>Phone</strong></td><td>{{customer_phone}}</td></tr>',
            '<tr><td><strong>Email</strong></td><td>{{customer_email}}</td></tr>',
            '<tr><td><strong>Delivery</strong></td><td>{{delivery_method}} ({{delivery_cost}})</td></tr>',
            '<tr><td><strong>Expected</strong></td><td>{{estimated_delivery}}</td></tr>',
            '</table>',
            '<p><a href="{{tracking_url}}" style="background:#0d6efd;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;">Open the order</a></p>',
            '<p style="color:#666;font-size:12px;">Sent to the order management team. Reply-to goes to the shared mailbox, not the customer.</p>',
        ].join('\n'),
        available_variables: JSON.stringify([
            'order_id', 'order_status', 'total', 'items_summary',
            'customer_name', 'customer_phone', 'customer_email',
            'delivery_method', 'delivery_cost', 'estimated_delivery', 'tracking_url',
        ]),
        scope: 'global',
        send_to: 'staff',
        is_active: true,
        is_enabled: true,
        created_at: now,
        updated_at: now,
        published_at: now,
    });
    return { created: 1, skipped: 0 };
}

module.exports = { applyOrderPlacedTeamAlert };
