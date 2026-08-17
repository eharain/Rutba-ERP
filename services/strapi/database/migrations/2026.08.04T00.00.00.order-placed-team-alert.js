'use strict';

///NOTE: Strapi binds a migration to its filename and only runs it once.
///      To re-run, rename the file or create a new one.

/**
 * Seed the internal "new order placed" alert for the order management team.
 *
 * The buyer already receives "Order Confirmed (Buyer)" on the order_placed
 * trigger; this is the ops-side counterpart, sent to send_to='staff' — which
 * resolves to ORDER_ALERT_EMAIL. That variable is NOT set in any env file yet,
 * so until it is, the alert falls back to EMAIL_FROM.
 *
 * Per project_data_seeding_strategy_migrations_not_seed_json — reference
 * templates belong in a migration, not src/seed/data. Idempotent, so the team
 * can edit the template without it being restored on the next boot.
 */

const { applyOrderPlacedTeamAlert } = require('../../src/seed/seeders/order-placed-team-alert');

async function up(knex) {
    await applyOrderPlacedTeamAlert(knex);
}

async function down() {
    // No-op: the team may have edited the template.
}

module.exports = { up, down };
