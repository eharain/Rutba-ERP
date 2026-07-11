'use strict';

/**
 * Default cost_change_approval notification template.
 *
 * Shared idempotent body used by BOTH:
 *   - database/migrations/2026.05.21T01.00.00.cost-change-approval-template.js
 *   - the seed registry (on-demand re-run from the CLI / control app)
 *
 * Sent to the buyer whenever staff change the items/total of a confirmed order;
 * the customer clicks {{confirm_url}} to approve before the order can advance to
 * packaging. Works at the knex layer so it runs in both a migration and the
 * engine. Idempotent: inserts only when no row with this name exists.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<{created:number, skipped:number}>}
 */
async function applyCostChangeApprovalTemplate(knex) {
    const tableExists = await knex.schema.hasTable('notification_templates');
    if (!tableExists) return { created: 0, skipped: 0 };

    const name = 'Order Cost Change Approval (Buyer)';
    const existing = await knex('notification_templates').where({ name }).limit(1);
    if (existing.length > 0) return { created: 0, skipped: 1 };

    const now = new Date();
    await knex('notification_templates').insert({
        name,
        event_name: 'order.cost_change',
        trigger_event: 'cost_change_approval',
        category: 'orders_payments',
        priority: 'critical',
        audience: 'user',
        is_critical: true,
        send_email: true,
        // `channels` is a JSON column on Postgres / longtext on MySQL —
        // serialise so both engines store consistently.
        channels: JSON.stringify(['email']),
        channel: 'email',
        delay_minutes: 0,
        dedup_window_minutes: 0,
        subject: 'Action required: confirm changes to order {{order_id}}',
        body_template: [
            '<p>Hi {{customer_name}},</p>',
            '<p>We need to update your order <strong>{{order_id}}</strong> before we pack it.</p>',
            '<p><strong>Old total:</strong> {{old_total}}<br/>',
            '<strong>New total:</strong> {{new_total}}</p>',
            '<p><strong>Reason:</strong> {{change_reason}}</p>',
            '<p><strong>Items:</strong> {{items_summary}}</p>',
            '<p>Please confirm you accept the updated total by clicking the link below — your order will then move to packaging.</p>',
            '<p><a href="{{confirm_url}}" style="background:#0d6efd;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;">Confirm updated order</a></p>',
            '<p style="color:#666;font-size:12px;">If you didn\'t expect this email or want to discuss the change, reply to this message and our team will get back to you.</p>',
        ].join('\n'),
        available_variables: JSON.stringify([
            'customer_name', 'order_id', 'items_summary',
            'old_total', 'new_total', 'change_reason', 'confirm_url', 'change_requested_at',
        ]),
        scope: 'global',
        send_to: 'customer',
        is_active: true,
        is_enabled: true,
        created_at: now,
        updated_at: now,
        published_at: now,
    });
    return { created: 1, skipped: 0 };
}

module.exports = { applyCostChangeApprovalTemplate };
