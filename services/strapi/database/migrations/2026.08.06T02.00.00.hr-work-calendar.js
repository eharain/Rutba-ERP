'use strict';

///NOTE: Strapi binds a migration to its filename and only runs it once.
///      To re-run, rename the file or create a new one.

/**
 * Seed the HR work-calendar reference data: shift templates, fixed-date public
 * holidays, a standard overtime rule, and the appraisal competencies.
 *
 * These tables are now read by real behaviour — leave-day maths skips holidays,
 * attendance derives Late from the rostered shift, payroll pays overtime, and
 * appraisals score competencies — so an empty table means a wired feature that
 * silently does nothing. Shipping the defaults is what makes those features
 * work on a fresh database instead of after a round of manual data entry.
 *
 * Per project_data_seeding_strategy_migrations_not_seed_json — reference data
 * belongs in a migration, not src/seed/data. The same body is exposed as the
 * `hr-work-calendar` registry entry for on-demand re-runs.
 */

const { applyHrWorkCalendar } = require('../../src/seed/seeders/hr-work-calendar');

async function up(knex) {
    await applyHrWorkCalendar(knex);
}

async function down() {
    // No-op: HR may have edited the shifts, holidays, rule or competencies.
}

module.exports = { up, down };
