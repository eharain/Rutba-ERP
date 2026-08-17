'use strict';

///NOTE: Strapi binds a migration to its filename and only runs it once.
///      To re-run, rename the file or create a new one.

/**
 * Seed the standard HR letter templates (offer, confirmation, experience,
 * salary certificate, NOC, warning, relieving).
 *
 * Without at least one active template the Letters page has an empty dropdown
 * and nothing can be generated, so these ship as part of the module rather than
 * being left as setup homework. HR edits the wording in-app; the seeder is
 * idempotent and never overwrites an edited row.
 *
 * Per project_data_seeding_strategy_migrations_not_seed_json — reference
 * templates belong in a migration, not src/seed/data. The same body is exposed
 * as the `hr-letter-templates` registry entry for on-demand re-runs.
 */

const { applyHrLetterTemplates } = require('../../src/seed/seeders/hr-letter-templates');

async function up(knex) {
    await applyHrLetterTemplates(knex);
}

async function down() {
    // No-op: HR may have edited the templates.
}

module.exports = { up, down };
