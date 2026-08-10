'use strict';

/**
 * helpdesk_routing_rules — the condition-based overrides the assignment engine
 * reads (spec 14 §14.7).
 *
 * Migration 014 deliberately stopped short of the tables belonging to engines
 * that had not been built, and this was one of them. The engine now exists:
 * routing.service.js probes for the table and degrades to "no rules configured"
 * when it is absent, which keeps intake working — but createRoutingRule and
 * updateRoutingRule refuse with a ValidationError, so until this table exists a
 * routing rule cannot be configured at all. That is the gap this closes.
 *
 * THE COLUMN LIST IS NOT A DESIGN DECISION TAKEN HERE. routing.service.js
 * selects exactly ROUTING_RULE_COLUMNS on every read and inserts exactly those
 * columns on create, so the names and their order are copied from that constant
 * rather than re-derived. A column this table has that the constant does not
 * would never be read; one the constant has that this table does not turns every
 * rule query into an SQL error.
 *
 * No foreign keys, and indexes applied through their own guarded pass — see 011
 * for the full reasoning behind both.
 *
 * `key` is a MySQL reserved word (011 says the same about helpdesk_desks): the
 * query builder quotes identifiers, but hand-written knex.raw() against this
 * table must backtick it. It carries no unique index on purpose — the service
 * allows a null key and does not check uniqueness, so a constraint here would
 * surface as a raw ER_DUP_ENTRY from a save the service believed it had
 * validated. Same call as helpdesk_queues in 014.
 *
 * AFTER APPLYING THIS, RESTART THE CORE PROCESS. routing.service.js caches its
 * hasTable probe per process for the life of the run, so a server that was up
 * while this ran keeps reporting "no rules configured" until it restarts.
 */

const TABLE = 'helpdesk_routing_rules';

const INDEXES = [
  ['helpdesk_routing_rules_document_id_unq',
    (t) => t.unique(['document_id'], { indexName: 'helpdesk_routing_rules_document_id_unq' })],
  // The shape of every rule read: active rules for one desk plus the tenant-wide
  // ones, in sequence order.
  ['helpdesk_routing_rules_desk_idx',
    (t) => t.index(['desk_id', 'is_active', 'sequence'], 'helpdesk_routing_rules_desk_idx')],
  ['helpdesk_routing_rules_key_idx', (t) => t.index(['key'], 'helpdesk_routing_rules_key_idx')],
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
  name: '017-helpdesk-routing-rules',

  async up(knex) {
    if (!(await knex.schema.hasTable(TABLE))) {
      await knex.schema.createTable(TABLE, (t) => {
        t.increments('id').primary();
        t.string('document_id', 64).notNullable();

        t.string('key', 60).nullable();
        t.string('name', 191).notNullable();

        // Null = tenant-wide. Only tenant-wide rules are considered when
        // resolving the DESK itself: a desk-scoped rule cannot decide which desk
        // applies without begging the question (§14.2 step 1).
        t.integer('desk_id').unsigned().nullable();

        // First match wins, ascending. Defaulted to 100 rather than 0 to match
        // the service's own default — a rule inserted by hand without a sequence
        // must not silently become the highest-priority rule on the desk.
        t.integer('sequence').notNullable().defaultTo(100);

        // The ./conditions expression tree. Null (or empty) matches everything,
        // which is what makes a rule a catch-all.
        t.jsonb('conditions').nullable();

        // Null = inherit the desk's strategy. Validated against the service's
        // STRATEGIES list on save, not here: adding a strategy is a code change
        // and must not need DDL on this table.
        t.string('strategy', 32).nullable();

        t.integer('target_desk_id').unsigned().nullable();
        t.integer('target_team_id').unsigned().nullable();
        t.integer('target_agent_id').unsigned().nullable();

        t.boolean('is_active').notNullable().defaultTo(true);
        t.dateTime('created_at', { precision: 3 }).notNullable();
        t.dateTime('updated_at', { precision: 3 }).notNullable();
      });
      console.log(`[migrate] created ${TABLE}`);
    }

    for (const [name, add] of INDEXES) {
      if (await hasIndex(knex, TABLE, name)) continue;
      await knex.schema.alterTable(TABLE, add);
      console.log(`[migrate] ${TABLE}: created index ${name}`);
    }
  },

  // Safe to roll back: the table holds only configuration an operator entered,
  // nothing points at it, and its absence is a state routing.service.js already
  // handles as "no rules configured".
  async down(knex) {
    await knex.schema.dropTableIfExists(TABLE);
  },
};
