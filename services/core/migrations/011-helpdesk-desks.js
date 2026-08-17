'use strict';

/**
 * M3 — helpdesk_desks (spec 07 §7.5).
 *
 * The desk is the module's generality mechanism: a new area of the business is
 * a row here, not a release. Everything a vertical helpdesk would hardcode —
 * which lifecycle applies, which SLA promise, who may see the queue, whether
 * anonymous intake is allowed, how long a reopen stays possible — is a column
 * on this table.
 *
 * Core-owned, so it is deliberately absent from pos-strapi's schema.json: the
 * schema registry, documents() and Strapi admin cannot see it and the helpdesk
 * repositories read it through knex. That is decision D2 in spec 00, taken
 * knowingly (the module has its own app and its own API, so Strapi admin
 * visibility buys nothing).
 *
 * NO FOREIGN KEYS ON ANY HELPDESK TABLE. Four reasons, in order of weight:
 *   - A desk points at an SLA policy and a policy points back at its desk. The
 *     two tables are created by different migrations, so any FK pair between
 *     them is circular and cannot be applied in one order.
 *   - References that leave the module (workflow_id → workflows,
 *     default_assignee_id → up_users, ticket_id → contact_tickets) target
 *     tables pos-strapi owns and Strapi's boot-time schema sync rewrites, and
 *     contact-ticket still exposes a core delete route — a RESTRICT there turns
 *     a normal 400 into a raw ER_ROW_IS_REFERENCED from a table the caller has
 *     never heard of, while a cascade is forbidden program-wide.
 *   - knex emits every constraint as a separate ALTER after CREATE TABLE, and
 *     MySQL implicitly commits each one. A migration that dies between them
 *     leaves a table whose hasTable guard now says "done" and whose constraints
 *     were never applied. Indexes have the same problem, which is why they are
 *     applied through ensureIndexes below rather than inside createTable.
 *   - RESTRICT only duplicates a check the services have to make anyway, with a
 *     worse error message. Referential integrity here is a service concern,
 *     enforced in one place where it can explain itself.
 *
 * `key` is a MySQL reserved word. knex quotes identifiers, so every query built
 * through the query builder is safe; hand-written knex.raw() against this table
 * must backtick it.
 *
 * `branch_ids` is a json array rather than a link table: spec §7.5 reads "empty
 * = all branches", there are single digits of desks, and a link table would buy
 * join syntax at the cost of a second write path for a set edited once a year.
 */

const TABLE = 'helpdesk_desks';

const INDEXES = [
  ['helpdesk_desks_document_id_unq', (t) => t.unique(['document_id'], { indexName: 'helpdesk_desks_document_id_unq' })],
  ['helpdesk_desks_key_unq', (t) => t.unique(['key'], { indexName: 'helpdesk_desks_key_unq' })],
  ['helpdesk_desks_active_seq_idx', (t) => t.index(['is_active', 'sequence'], 'helpdesk_desks_active_seq_idx')],
  ['helpdesk_desks_email_idx', (t) => t.index(['email_address'], 'helpdesk_desks_email_idx')],
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

async function ensureIndexes(knex, table, indexes) {
  for (const [name, add] of indexes) {
    if (await hasIndex(knex, table, name)) continue;
    await knex.schema.alterTable(table, add);
    console.log(`[migrate] ${table}: created index ${name}`);
  }
}

module.exports = {
  name: '011-helpdesk-desks',

  async up(knex) {
    if (!(await knex.schema.hasTable(TABLE))) {
      await knex.schema.createTable(TABLE, (t) => {
        t.increments('id').primary();
        // documentId alongside the internal id, so a desk can be addressed in
        // an API payload with the same kind of identifier as every other entity
        // in the ERP even though this table is invisible to Strapi (§37.5).
        t.string('document_id', 64).notNullable();

        t.string('key', 60).notNullable();
        t.string('name', 191).notNullable();
        t.text('description').nullable();
        t.boolean('is_active').notNullable().defaultTo(true);
        t.integer('sequence').notNullable().defaultTo(0);

        // member_only | org_visible | restricted (spec 04 §4.4). Plain strings
        // rather than enums throughout: adding a mode should be a code change,
        // not DDL on a table the whole module reads.
        t.string('visibility_mode', 20).notNullable().defaultTo('org_visible');
        t.string('default_priority', 16).notNullable().defaultTo('normal');
        t.integer('default_assignee_id').unsigned().nullable();
        t.integer('default_team_id').unsigned().nullable();

        // RULE-7: a desk without all three of these is not saveable. Nullable
        // in DDL because the seed has to create the desk before it can point at
        // rows created in later migrations; DeskService enforces the rule.
        t.integer('workflow_id').unsigned().nullable();
        t.integer('sla_policy_id').unsigned().nullable();
        t.integer('business_calendar_id').unsigned().nullable();

        t.boolean('allow_anonymous').notNullable().defaultTo(false);
        t.boolean('require_resolution_note').notNullable().defaultTo(false);
        t.boolean('grant_line_manager_access').notNullable().defaultTo(false);
        t.jsonb('requester_kinds').nullable();
        t.integer('reopen_window_days').notNullable().defaultTo(14);
        t.integer('auto_close_after_days').notNullable().defaultTo(7);
        t.boolean('csat_enabled').notNullable().defaultTo(false);
        t.string('email_address', 191).nullable();
        t.jsonb('branch_ids').nullable();

        // Legacy contact_tickets.category values this desk absorbs, as a json
        // array. Read by migration 016 to backfill desk_id, and kept afterwards
        // so a ticket still arriving with a legacy category routes correctly.
        t.jsonb('category_map').nullable();

        t.dateTime('created_at', { precision: 3 }).notNullable();
        t.dateTime('updated_at', { precision: 3 }).notNullable();
      });
      console.log(`[migrate] created ${TABLE}`);
    }

    await ensureIndexes(knex, TABLE, INDEXES);
  },

  async down(knex) {
    await knex.schema.dropTableIfExists(TABLE);
  },
};
