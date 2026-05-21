'use strict';

///NOTE:kindly note that strapi uses run once migration bind with file name,  it never re-exec.
///     The new execution requires either renaming the migration file or creating new one

/**
 * Seed the default Return Policy single-type row.
 *
 * Per project_data_seeding_strategy_migrations_not_seed_json — reference
 * defaults like this belong in a migration, not src/seed/data. Idempotent:
 * only inserts when the table is empty so admins can edit the row freely
 * without it being clobbered on the next boot.
 *
 * The single-type holds a global 7-day return window. Per-product opt-outs
 * live on `product.non_returnable`. Per-category / per-channel scope is
 * deferred to a Phase-F.OFFERS slice.
 */

async function up(knex) {
    const tableExists = await knex.schema.hasTable('return_policies');
    if (!tableExists) return;

    const existing = await knex('return_policies').select('id').limit(1);
    if (existing.length > 0) return;

    const now = new Date();
    await knex('return_policies').insert({
        window_days: 7,
        restocking_fee_percent: 0,
        return_shipping_borne_by: 'merchant',
        exchange_enabled: false,
        policy_text: 'Items can be returned within 7 days of delivery. Products must be unused and in original packaging. Refunds are processed within 5-7 business days of inspection.',
        created_at: now,
        updated_at: now,
        published_at: now,
    });
}

async function down() {
    // No-op: defaults are non-destructive; admins may have edited them.
}

module.exports = { up, down };
