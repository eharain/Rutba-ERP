'use strict';

///NOTE: Strapi binds a migration to its filename and only runs it once.
///      To re-run, rename the file or create a new one.

/**
 * Re-run of 2026.08.14T00.00.00.prune-social-write-policies.js after a bug fix.
 *
 * That migration's body listed the methods to delete and named one of them
 * `delete`. Policy keys carry the descriptor's METHOD name — `del` — so six
 * `…:del:social_*` rows were never matched, and social_admin kept the ability
 * to delete social accounts and relay providers even though management had
 * moved to the rutba-admin console.
 *
 * The body is now inverted (keep an explicit read list, prune everything else
 * for social_* roles on those two interfaces), which is fail-closed. Strapi
 * records migrations by filename and will not re-run the original, hence this
 * second file rather than an edit to the first. The body is idempotent, so
 * running it on a database where the first version already did its part simply
 * removes the six rows it missed.
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
