'use strict';

///NOTE: Strapi binds a migration to its filename and only runs it once.
///      To re-run, rename the file or create a new one.

/**
 * Seed the HR / ESS in-app notification templates.
 *
 * The HR module fires notification events by name — hr.leave.submitted,
 * hr.expense.approved, hr.appraisal.completed, hr.incident.reported and the
 * rest. The engine resolves recipients from a matching notification_templates
 * row; with no row it finds no template, resolves nobody, and drops the event
 * without error. So on a fresh database these rows are the difference between
 * "HR notifications work" and "HR notifications silently do nothing".
 *
 * Per project_data_seeding_strategy_migrations_not_seed_json — reference
 * templates belong in a migration, not src/seed/data. The same body is exposed
 * as the `hr-notification-templates` registry entry so it can be re-run on
 * demand from the seed control app.
 *
 * Idempotent: inserts only names that are absent, so HR can retune subject and
 * body copy without it being restored on the next boot.
 */

const { applyHrNotificationTemplates } = require('../../src/seed/seeders/hr-notification-templates');

async function up(knex) {
    await applyHrNotificationTemplates(knex);
}

async function down() {
    // No-op: HR may have edited the templates.
}

module.exports = { up, down };
