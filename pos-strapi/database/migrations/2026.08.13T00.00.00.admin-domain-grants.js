'use strict';

///NOTE: Strapi binds a migration to its filename and only runs it once.
///      To re-run, rename the file or create a new one.

/**
 * The rutba-users → rutba-admin cutover. Every holder of a `users_*` app-role
 * additively gets the matching `admin_*` role, so the administrators who ran
 * the old User Management app can open the new admin console without a manual
 * grant round.
 *
 * This is a first-boot migration rather than seed-only on purpose: rutba-users
 * is deleted in the same commit, so a deployment that boots the new code
 * WITHOUT having run `npm run seed` would otherwise have no admin console and
 * no UI left to fix it from. The seeder body upserts the admin domain/roles
 * itself precisely so it works before the api-pro seed has run.
 *
 * Additive only — nothing is removed or moved, and the `users` domain stays
 * alive as a deprecated alias. The same body is exposed as the
 * `admin-domain-grants` registry entry for on-demand re-runs.
 */

const { applyAdminDomainGrants } = require('../../src/seed/seeders/admin-domain-grants');

async function up(knex) {
    await applyAdminDomainGrants(knex);
}

async function down() {
    // No-op: revoking would remove access an admin may since have relied on,
    // and the grants are indistinguishable from ones assigned by hand.
}

module.exports = { up, down };
