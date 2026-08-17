'use strict';

/**
 * Repair notification templates that were seeded onto the wrong engine.
 *
 * Shared idempotent body used by BOTH:
 *   - database/migrations/2026.08.04T01.00.00.notification-template-routing.js
 *   - the seed registry (on-demand re-run from the CLI / control app)
 *
 * ── What went wrong ───────────────────────────────────────────────────────
 * Two independent things read this one table:
 *
 *   sale-order/services/notification-service.js  selects on `trigger_event`
 *     — the sale-order lifecycle (order_placed, out_for_delivery, ...). It mails
 *       whoever `send_to` names and it is the ONLY reader of `send_to`.
 *   notification/services/notification-engine.js selects on `event_name`
 *     — generic app events (contact.*, stock.*, cart.*). It resolves people from
 *       `audience` and never looks at `send_to` at all.
 *
 * `trigger_event` is required:true and its enum only covers the sale-order
 * lifecycle, so the engine-owned rows in src/seed/data/notification-template.json
 * had no legal value to declare "not a sale-order trigger". They were given real
 * triggers as filler. The result: "Support Ticket Submitted (User+Admin)" carried
 * trigger_event='order_placed', so every storefront checkout mailed the buyer
 * "We received your message" alongside their order confirmation. Six more rows
 * were mis-pointed the same way at out_for_delivery / cancelled / refund_initiated.
 * `send_to` was never authored at all, so all of them fell to the 'customer'
 * default — including the stock and SLA alerts meant for internal staff.
 *
 * ── The fix ───────────────────────────────────────────────────────────────
 * schema.json now carries a neutral `trigger_event: 'none'`, which the
 * sale-order service can never match (it only ever queries real lifecycle
 * events). Engine-owned rows are moved onto it and keep firing through
 * `event_name`, which this does not touch. `send_to` is set to the audience each
 * row's name already claims.
 *
 * Scoped and idempotent: each row is matched on name + event_name and updated
 * only while it still holds the exact wrong value this migration knows about. A
 * second run matches nothing. If someone has since re-pointed a row on purpose,
 * that row is left alone rather than fought over. Subjects, bodies and schedules
 * are never touched, so team edits survive.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<{updated:number, skipped:number}>}
 */

/**
 * Rows that belong to the notification-engine, with the bogus sale-order trigger
 * each was seeded with. `send_to` is inert for these (the engine reads
 * `audience`) but is corrected so the row stops claiming to mail the customer.
 */
const ENGINE_OWNED = [
    // No payment_failed trigger exists; the engine handles payment.failed.
    { name: 'Payment Failed (Buyer)', eventName: 'payment.failed', wrongTrigger: 'payment_confirmed', sendTo: 'customer' },
    { name: 'Cart Abandoned Reminder (Buyer)', eventName: 'cart.abandoned', wrongTrigger: 'offer_accepted', sendTo: 'customer' },
    // The live bug: this mailed every storefront buyer on checkout.
    { name: 'Support Ticket Submitted (User+Admin)', eventName: 'contact.submitted', wrongTrigger: 'order_placed', sendTo: 'customer' },
    { name: 'Support Reply Added (Opposite Party)', eventName: 'contact.reply.added', wrongTrigger: 'out_for_delivery', sendTo: 'customer' },
    { name: 'Support SLA Breach (Admin)', eventName: 'contact.sla.breach', wrongTrigger: 'refund_initiated', sendTo: 'admin' },
    { name: 'Low Stock Alert (Stock Team)', eventName: 'stock.low', wrongTrigger: 'cancelled', sendTo: 'staff' },
    { name: 'Stock Out Alert (Stock Team)', eventName: 'stock.out', wrongTrigger: 'cancelled', sendTo: 'staff' },
];

async function applyNotificationTemplateRouting(knex) {
    const tableExists = await knex.schema.hasTable('notification_templates');
    if (!tableExists) return { updated: 0, skipped: 0 };

    let updated = 0;
    let skipped = 0;

    for (const row of ENGINE_OWNED) {
        // Two narrowly-scoped statements rather than one: a DB that was
        // half-corrected by hand still converges, and neither can silently
        // widen into rows this migration does not know about.
        const movedTrigger = await knex('notification_templates')
            .where({ name: row.name, event_name: row.eventName, trigger_event: row.wrongTrigger })
            .update({ trigger_event: 'none', updated_at: new Date() });

        const movedRecipient = row.sendTo === 'customer'
            ? 0
            : await knex('notification_templates')
                .where({ name: row.name, event_name: row.eventName, send_to: 'customer' })
                .update({ send_to: row.sendTo, updated_at: new Date() });

        if (movedTrigger || movedRecipient) updated += 1;
        else skipped += 1;
    }

    return { updated, skipped };
}

module.exports = { applyNotificationTemplateRouting, ENGINE_OWNED };
