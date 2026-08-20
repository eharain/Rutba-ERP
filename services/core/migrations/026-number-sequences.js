'use strict';

/**
 * Document-number sequences (portal task E1 — company config).
 *
 * The estate mints document numbers four incompatible ways, and the only one
 * that even tries to be a sequence is unsafe:
 *
 *   `accounting.generateEntryNumber()` reads the latest journal entry, parses
 *   its trailing digits, and adds one. Two posts landing together read the same
 *   latest and mint the SAME number. Nothing detects it — `entry_number` has no
 *   unique index — so the books end up with two JE-000042s and no way to tell
 *   which line belonged to which.
 *
 * A counter cannot be made safe in JavaScript. It needs one row that a database
 * increments atomically, which is what this table is.
 *
 * ── Why a counter row and not MAX()+1 ────────────────────────────────────
 *
 * `SELECT MAX(seq)+1` has the same race under every isolation level short of
 * serializable, and serializable turns every invoice into a lock convoy.
 * `UPDATE … SET next_value = next_value + 1` takes a row lock for the duration
 * of one statement and is correct under READ COMMITTED, which is what this
 * estate runs.
 *
 * ── Why the key is opaque ────────────────────────────────────────────────
 *
 * `scope_key` is built by the contract's `sequenceKey()` — `invoice:b3:y2026`,
 * `journal-entry:y2026`. Splitting it into scheme/branch/year columns here
 * would put the scoping rule in two places, and the day they disagree two
 * documents share a number. The table stores what the contract computed and
 * has no opinion about its shape.
 *
 * Core-owned: absent from services/strapi's schema.json, invisible to the registry
 * and documents(). Read and written through knex only.
 */

const TABLE = 'core_number_sequences';

module.exports = {
  name: '026-number-sequences',

  async up(knex) {
    if (await knex.schema.hasTable(TABLE)) return;
    await knex.schema.createTable(TABLE, (t) => {
      // varchar(191): the utf8mb4 index-prefix arithmetic (191 * 4 = 764 bytes,
      // under MySQL's 767), same as every other core-owned key column.
      t.string('scope_key', 191).notNullable().primary();

      /**
       * The NEXT value to hand out, not the last one handed out. The allocator
       * increments then reads, so a row created at 1 yields 1 first — an
       * off-by-one here means every series starts at 2 or reuses its first
       * number, and both are noticed only after the numbers are printed.
       */
      t.bigInteger('next_value').notNullable().defaultTo(1);

      t.dateTime('created_at', { precision: 3 }).notNullable();
      t.dateTime('updated_at', { precision: 3 }).notNullable();
    });
  },

  async down(knex) {
    if (await knex.schema.hasTable(TABLE)) await knex.schema.dropTable(TABLE);
  },
};
