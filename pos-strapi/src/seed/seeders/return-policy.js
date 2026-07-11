'use strict';

/**
 * Default Return Policy single-type row.
 *
 * Shared idempotent body used by BOTH:
 *   - database/migrations/2026.05.21T00.00.00.return-policy-seed.js (first boot)
 *   - the seed registry (on-demand re-run from the CLI / control app)
 *
 * Works purely at the knex layer so the same function runs in a migration
 * (which receives knex) and in the engine (which passes strapi.db.connection).
 * Idempotent: inserts only when the table is empty, so admins can edit the row
 * freely without it being clobbered.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<{created:number, skipped:number}>}
 */
async function applyReturnPolicy(knex) {
    const tableExists = await knex.schema.hasTable('return_policies');
    if (!tableExists) return { created: 0, skipped: 0 };

    const existing = await knex('return_policies').select('id').limit(1);
    if (existing.length > 0) return { created: 0, skipped: 1 };

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
    return { created: 1, skipped: 0 };
}

module.exports = { applyReturnPolicy };
