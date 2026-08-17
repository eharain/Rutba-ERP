'use strict';

/**
 * The policy seeder's checkpoint (P1: api-pro seeder port).
 *
 * `src/policy/seeder.js` decides what to write by diffing the descriptor
 * contract against the `api_pro_*` tables — which is exact, but costs ~1.5s
 * because it imports all 178 descriptor modules. That is fine for the CLI and
 * for CI; it is not fine on every core boot, where nothing has changed 99% of
 * the time and the number lands straight in the boot-time baseline.
 *
 * So boot takes a fast path: hash the contract's input files, count the rows
 * the last seed produced, and compare both against this table. A match skips
 * the walk entirely (~10ms); anything else — edited descriptor, hand-deleted
 * row, restored dump, fresh database — falls through to the full diff.
 *
 * Counts as well as the hash, because those catch different failures: the hash
 * sees a contract change the database has not caught up with, the counts see a
 * database change the contract never asked for.
 *
 * One row per seeder (`name`), so the same mechanism can carry the seed packs
 * tenant provisioning will need without another table.
 *
 * Core-owned: deliberately absent from pos-strapi's schema.json, invisible to
 * the schema registry and documents(). Read and written through knex only.
 */

const TABLE = 'core_policy_checkpoints';

module.exports = {
  name: '021-policy-seed-checkpoint',

  async up(knex) {
    if (await knex.schema.hasTable(TABLE)) return;
    await knex.schema.createTable(TABLE, (t) => {
      // varchar(191), not 255: the same utf8mb4 index-prefix arithmetic that
      // sized core_migrations.name (191 * 4 = 764 bytes, under MySQL's 767).
      t.string('name', 191).notNullable().primary();
      // SHA-256 hex of every seeder input file (path + bytes).
      t.string('fingerprint', 64).notNullable();
      // Row counts per table at the end of the last successful seed.
      t.json('counts').nullable();
      // What that run produced — descriptors scanned, rows written.
      t.json('summary').nullable();
      t.dateTime('seeded_at', { precision: 3 }).notNullable();
    });
  },

  async down(knex) {
    if (await knex.schema.hasTable(TABLE)) await knex.schema.dropTable(TABLE);
  },
};
