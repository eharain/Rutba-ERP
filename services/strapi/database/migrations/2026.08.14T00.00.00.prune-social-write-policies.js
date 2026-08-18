'use strict';

///NOTE: Strapi binds a migration to its filename and only runs it once.
///      To re-run, rename the file or create a new one.

/**
 * Drop the api-pro policy rows that still grant `social_*` roles the write
 * methods on social-accounts and social-relay-providers, now that managing
 * both moved to the apps/admin/console console (`apps: ['admin']` on those methods).
 *
 * Needed because the api-pro seeder only ever upserts: it adds the new
 * admin_* rows but never removes the social_* ones the descriptors stopped
 * declaring, so without this the move would be UI-only and social_admin could
 * still write. See the seeder module for the full reasoning.
 *
 * The same body is exposed as the `prune-social-write-policies` registry entry
 * so it can be re-run on demand — it has to run AFTER any api-provider reseed,
 * which is why it is registered immediately after that entry.
 */

const { pruneSocialWritePolicies } = require('../../src/seed/seeders/prune-social-write-policies');

async function up(knex) {
    await pruneSocialWritePolicies(knex);
}

async function down() {
    // No-op: re-granting social_* write access is a descriptor decision, not a
    // migration rollback. Restore `apps: ['social', 'admin']` and reseed.
}

module.exports = { up, down };
