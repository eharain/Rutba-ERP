'use strict';

/**
 * M10 (partial) — the supporting configuration tables: teams and their
 * membership, saved queues, resolution codes, and the dedupe claim table
 * (spec 07 §7.6, spec 32 §32.8–32.9).
 *
 * Catalog, automation, macro and approval tables are the rest of M10 and are
 * not created here; they belong to the waves that build those engines and would
 * otherwise ship as empty tables nothing reads.
 *
 * helpdesk_ticket_dedupe deserves an explanation, because it is a table that
 * exists to hold an index. Spec §7.3 requires dedupe_key to be unique among
 * NON-TERMINAL tickets — a recurring monitoring alert must be idempotent while
 * its ticket is open, and must be able to raise a fresh ticket once that one is
 * closed. MySQL has no partial unique index, and the two ways to fake one on
 * contact_tickets both fail the program's own gates: a generated column would
 * appear in the live database without a matching schema.json attribute and
 * break validate-schema, and a functional index relies on hidden-column
 * behaviour that cannot be verified from here. So the constraint lives in its
 * own Core-owned table: TicketService claims the key on create and releases it
 * when the ticket reaches a terminal status. A SELECT-then-INSERT check in the
 * service would race two concurrent event deliveries into two tickets, which is
 * precisely the failure the dedupe key exists to prevent — the unique index is
 * the guarantee, not an optimisation of one.
 *
 * The claim key is varchar(191), narrower than contact_tickets.dedupe_key's
 * Strapi-mandated varchar(255): callers must hash anything longer before
 * claiming, and a hash is what a sensible dedupe key already is.
 *
 * NO SEEDED QUEUES. Spec §32.9 names seven default views, but a queue's
 * `filter` json is the repository's query dialect, and seeding rows against a
 * dialect that has not been written yet produces configuration that looks valid
 * and silently matches nothing. The table ships; the seven defaults ship with
 * the repository that can execute them.
 *
 * No foreign keys, and indexes applied through their own guarded pass — see 011
 * for both.
 */

const TEAMS = 'helpdesk_teams';
const TEAM_MEMBERS = 'helpdesk_team_members';
const QUEUES = 'helpdesk_queues';
const RESOLUTION_CODES = 'helpdesk_resolution_codes';
const DEDUPE = 'helpdesk_ticket_dedupe';

const TABLES = [
  {
    name: TEAMS,
    columns: (t) => {
      t.increments('id').primary();
      t.string('document_id', 64).notNullable();
      t.string('key', 60).notNullable();
      t.string('name', 191).notNullable();
      t.integer('desk_id').unsigned().nullable();
      t.integer('manager_id').unsigned().nullable();
      // Same shape as a business calendar's working_days, so a team covering a
      // different shift can be evaluated by the same code.
      t.jsonb('working_hours').nullable();
      t.jsonb('skills').nullable();
      t.boolean('is_active').notNullable().defaultTo(true);
      t.integer('sequence').notNullable().defaultTo(0);
      t.dateTime('created_at', { precision: 3 }).notNullable();
      t.dateTime('updated_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_teams_document_id_unq',
        (t) => t.unique(['document_id'], { indexName: 'helpdesk_teams_document_id_unq' })],
      ['helpdesk_teams_key_unq', (t) => t.unique(['key'], { indexName: 'helpdesk_teams_key_unq' })],
      ['helpdesk_teams_desk_idx', (t) => t.index(['desk_id', 'is_active'], 'helpdesk_teams_desk_idx')],
    ],
  },
  {
    name: TEAM_MEMBERS,
    columns: (t) => {
      t.increments('id').primary();
      t.string('document_id', 64).notNullable();
      t.integer('team_id').unsigned().notNullable();
      t.integer('user_id').unsigned().notNullable();
      // member | lead
      t.string('role_in_team', 16).notNullable().defaultTo('member');
      // Relative share of round-robin/load-balanced assignment. 100 = a full
      // share; a part-time agent at 50 receives half of one.
      t.integer('capacity_weight').notNullable().defaultTo(100);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.dateTime('created_at', { precision: 3 }).notNullable();
      t.dateTime('updated_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_team_members_document_id_unq',
        (t) => t.unique(['document_id'], { indexName: 'helpdesk_team_members_document_id_unq' })],
      ['helpdesk_team_members_team_user_unq',
        (t) => t.unique(['team_id', 'user_id'], { indexName: 'helpdesk_team_members_team_user_unq' })],
      ['helpdesk_team_members_user_idx',
        (t) => t.index(['user_id', 'is_active'], 'helpdesk_team_members_user_idx')],
    ],
  },
  {
    name: QUEUES,
    columns: (t) => {
      t.increments('id').primary();
      t.string('document_id', 64).notNullable();
      t.string('key', 60).notNullable();
      t.string('name', 191).notNullable();
      t.integer('desk_id').unsigned().nullable();
      // A queue is a saved view — filter + sort + columns. It is never a second
      // copy of the tickets, so nothing here caches a result.
      t.jsonb('filter').nullable();
      t.jsonb('sort').nullable();
      t.jsonb('columns').nullable();
      // Null owner = a desk-level or system queue rather than a private one.
      t.integer('owner_id').unsigned().nullable();
      t.integer('shared_with_team_id').unsigned().nullable();
      t.boolean('is_shared').notNullable().defaultTo(false);
      t.integer('sequence').notNullable().defaultTo(0);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.dateTime('created_at', { precision: 3 }).notNullable();
      t.dateTime('updated_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_queues_document_id_unq',
        (t) => t.unique(['document_id'], { indexName: 'helpdesk_queues_document_id_unq' })],
      // No unique on key: a queue key is unique per owner, and MySQL would let
      // NULL owners collide anyway. QueueService owns that check.
      ['helpdesk_queues_desk_idx',
        (t) => t.index(['desk_id', 'is_active', 'sequence'], 'helpdesk_queues_desk_idx')],
      ['helpdesk_queues_owner_idx', (t) => t.index(['owner_id'], 'helpdesk_queues_owner_idx')],
    ],
  },
  {
    name: RESOLUTION_CODES,
    columns: (t) => {
      t.increments('id').primary();
      t.string('document_id', 64).notNullable();
      t.string('key', 60).notNullable();
      t.string('name', 191).notNullable();
      // Null desk_id = available on every desk. MySQL treats NULLs as distinct
      // in a unique index, so the constraint below does NOT stop two global
      // codes sharing a key — the seeder and DeskService check that.
      t.integer('desk_id').unsigned().nullable();
      t.boolean('is_active').notNullable().defaultTo(true);
      t.boolean('requires_note').notNullable().defaultTo(false);
      // Whether a ticket ending on this code counts toward the resolution rate.
      // "Duplicate" and "no response from customer" are honest outcomes, but
      // reporting them as resolutions flatters the desk.
      t.boolean('counts_as_resolved').notNullable().defaultTo(true);
      t.integer('sequence').notNullable().defaultTo(0);
      t.dateTime('created_at', { precision: 3 }).notNullable();
      t.dateTime('updated_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_resolution_codes_document_id_unq',
        (t) => t.unique(['document_id'], { indexName: 'helpdesk_resolution_codes_document_id_unq' })],
      ['helpdesk_resolution_codes_key_desk_unq',
        (t) => t.unique(['key', 'desk_id'], { indexName: 'helpdesk_resolution_codes_key_desk_unq' })],
      ['helpdesk_resolution_codes_desk_idx',
        (t) => t.index(['desk_id', 'is_active', 'sequence'], 'helpdesk_resolution_codes_desk_idx')],
    ],
  },
  {
    name: DEDUPE,
    columns: (t) => {
      t.increments('id').primary();
      t.string('dedupe_key', 191).notNullable();
      t.integer('ticket_id').unsigned().notNullable();
      t.integer('desk_id').unsigned().nullable();
      t.dateTime('created_at', { precision: 3 }).notNullable();
    },
    indexes: [
      // The whole point of the table.
      ['helpdesk_ticket_dedupe_key_unq',
        (t) => t.unique(['dedupe_key'], { indexName: 'helpdesk_ticket_dedupe_key_unq' })],
      // Releasing a claim is a delete by ticket, on the terminal transition.
      ['helpdesk_ticket_dedupe_ticket_idx',
        (t) => t.index(['ticket_id'], 'helpdesk_ticket_dedupe_ticket_idx')],
    ],
  },
];

async function hasIndex(knex, table, name) {
  const database = knex.client.config.connection.database;
  if (/mysql/i.test(String(knex.client.config.client || ''))) {
    const row = await knex('information_schema.statistics')
      .where({ table_schema: database, table_name: table, index_name: name })
      .first('INDEX_NAME as index_name');
    return Boolean(row);
  }
  const row = await knex('pg_indexes').where({ tablename: table, indexname: name }).first('indexname');
  return Boolean(row);
}

module.exports = {
  name: '014-helpdesk-support-tables',

  async up(knex) {
    for (const table of TABLES) {
      if (!(await knex.schema.hasTable(table.name))) {
        await knex.schema.createTable(table.name, table.columns);
        console.log(`[migrate] created ${table.name}`);
      }
      for (const [name, add] of table.indexes) {
        if (await hasIndex(knex, table.name, name)) continue;
        await knex.schema.alterTable(table.name, add);
        console.log(`[migrate] ${table.name}: created index ${name}`);
      }
    }
  },

  async down(knex) {
    for (const table of [...TABLES].reverse()) {
      await knex.schema.dropTableIfExists(table.name);
    }
  },
};
