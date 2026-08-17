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

// The idempotent body lives in a shared module so it can be re-run on demand
// from the seed CLI / control app, not only once at first boot.
const { applyReturnPolicy } = require('../../src/seed/seeders/return-policy');

async function up(knex) {
    await applyReturnPolicy(knex);
}

async function down() {
    // No-op: defaults are non-destructive; admins may have edited them.
}

module.exports = { up, down };
