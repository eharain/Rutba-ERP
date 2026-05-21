'use strict';

///NOTE: Strapi binds a migration to its filename and only runs it once.
///      To re-run, rename the file or create a new one.

/**
 * Seed the default cost_change_approval notification template.
 *
 * Sent to the customer's email whenever a staff member changes the items
 * or total of an already-confirmed order. The customer clicks
 * {{confirm_url}} to approve; until they do, the order is blocked from
 * advancing into packaging (see VerificationStage/PreparationStage gating).
 *
 * Per project_data_seeding_strategy_migrations_not_seed_json — reference
 * templates belong in a migration, not src/seed/data. Idempotent: only
 * inserts when no row with this name exists, so admins can edit the
 * template freely without it being clobbered on the next boot.
 *
 * Placeholders consumed (see notification-service.buildVars + extraVars):
 *   - customer_name, order_id, items_summary
 *   - old_total, new_total, change_reason (extraVars)
 *   - confirm_url (extraVars)            — the one-click ack link
 *   - change_requested_at (extraVars)    — when staff submitted the change
 */

async function up(knex) {
    const tableExists = await knex.schema.hasTable('notification_templates');
    if (!tableExists) return;

    const name = 'Order Cost Change Approval (Buyer)';
    const existing = await knex('notification_templates').where({ name }).limit(1);
    if (existing.length > 0) return;

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
}

async function down() {
    // No-op: admins may have edited the template.
}

module.exports = { up, down };
