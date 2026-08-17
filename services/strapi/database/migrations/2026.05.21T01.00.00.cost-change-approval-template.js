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

// The idempotent body lives in a shared module so it can be re-run on demand
// from the seed CLI / control app, not only once at first boot.
const { applyCostChangeApprovalTemplate } = require('../../src/seed/seeders/cost-change-approval-template');

async function up(knex) {
    await applyCostChangeApprovalTemplate(knex);
}

async function down() {
    // No-op: admins may have edited the template.
}

module.exports = { up, down };
