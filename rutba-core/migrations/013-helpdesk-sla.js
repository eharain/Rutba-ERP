'use strict';

/**
 * M8 — the SLA policy model and the business calendar it measures against
 * (spec 12 §12.4–12.5).
 *
 * What exists today is one `sla_due_at` column set from a caller-supplied
 * sla_hours on the public submit route, plus an endpoint on which a client
 * tells the server it breached. These four tables replace guesswork with a
 * promise the desk can be held to: targets per priority, a calendar that says
 * what an hour of "business time" means, and holidays that take days out of it.
 *
 * FOUR TABLES IN ONE MIGRATION, in dependency order — calendars, their
 * holidays, policies, their targets. No foreign keys between them, for the
 * reasons set out in 011: knex applies constraints as separate ALTERs after
 * CREATE TABLE and MySQL commits each one, so a hasTable guard would report
 * "done" for a table whose constraints never landed. Parent/child integrity
 * here (a holiday's calendar, a target's policy) is SLAService's to enforce,
 * and the unique keys below are what actually protect the data shape.
 *
 * WHY BUSINESS CALENDARS ARE HELPDESK-OWNED HERE, when spec §7.2 lists them as
 * shared HR reference data: HR's work-calendar seeder produces roster data for
 * attendance, not the timezone-anchored working-interval model §12.5 needs, and
 * there is no Core-native calendar service to defer to yet. This table is the
 * model §12.5 describes; when a shared BusinessCalendar service appears, this
 * becomes its first tenant rather than a fork — the shape is deliberately the
 * one §12.5 specifies, not a helpdesk dialect.
 *
 * `working_days` is a json map of weekday → intervals, e.g.
 *   { "mon": [{ "start": "09:00", "end": "18:00" }], "sun": [] }
 * An array per day rather than a single start/end because split shifts are
 * ordinary here and a two-column model cannot express a lunch break without a
 * second table.
 *
 * PAUSING (§12.6): `pause_on_waiting` is the switch and `pause_stages` the
 * override. Null pause_stages means "every stage whose canonical status is
 * waiting", which is what the workflow service's is_paused already computes —
 * so the common case needs no configuration, and a regulated desk that must
 * measure elapsed time regardless just sets pause_on_waiting false. Only the
 * resolution clock ever pauses; first response never does.
 */

const CALENDARS = 'helpdesk_business_calendars';
const HOLIDAYS = 'helpdesk_holidays';
const POLICIES = 'helpdesk_sla_policies';
const TARGETS = 'helpdesk_sla_targets';

const TABLES = [
  {
    name: CALENDARS,
    columns: (t) => {
      t.increments('id').primary();
      t.string('document_id', 64).notNullable();
      t.string('key', 60).notNullable();
      t.string('name', 191).notNullable();
      // IANA zone. Everything is stored in UTC and converted here and only here
      // (§12.5) — the calendar's timezone, never the server's and never the
      // viewer's, or two people reading the same breach disagree.
      t.string('timezone', 64).notNullable().defaultTo('UTC');
      t.jsonb('working_days').nullable();
      t.boolean('is_default').notNullable().defaultTo(false);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.dateTime('created_at', { precision: 3 }).notNullable();
      t.dateTime('updated_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_business_calendars_document_id_unq',
        (t) => t.unique(['document_id'], { indexName: 'helpdesk_business_calendars_document_id_unq' })],
      ['helpdesk_business_calendars_key_unq',
        (t) => t.unique(['key'], { indexName: 'helpdesk_business_calendars_key_unq' })],
      ['helpdesk_calendars_default_idx',
        (t) => t.index(['is_default', 'is_active'], 'helpdesk_calendars_default_idx')],
    ],
  },
  {
    name: HOLIDAYS,
    columns: (t) => {
      t.increments('id').primary();
      t.string('document_id', 64).notNullable();
      t.integer('calendar_id').unsigned().notNullable();
      t.string('name', 191).notNullable();
      // Named holiday_date, not date: DATE is a keyword and a column called
      // `date` turns every hand-written query into a quoting question.
      t.date('holiday_date').notNullable();
      // Fixed-date national holidays repeat; lunar ones (Eid) move every year
      // and are entered per year by an operator. The stored year on a recurring
      // row is an anchor, not a claim about which year it applies to.
      t.boolean('is_recurring').notNullable().defaultTo(false);
      t.dateTime('created_at', { precision: 3 }).notNullable();
      t.dateTime('updated_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_holidays_document_id_unq',
        (t) => t.unique(['document_id'], { indexName: 'helpdesk_holidays_document_id_unq' })],
      ['helpdesk_holidays_cal_date_unq',
        (t) => t.unique(['calendar_id', 'holiday_date'], { indexName: 'helpdesk_holidays_cal_date_unq' })],
    ],
  },
  {
    name: POLICIES,
    columns: (t) => {
      t.increments('id').primary();
      t.string('document_id', 64).notNullable();
      t.string('key', 60).notNullable();
      t.string('name', 191).notNullable();
      // Null desk_id = tenant default, the last step of the resolution order
      // catalog item → desk → tenant default (§12.4).
      t.integer('desk_id').unsigned().nullable();
      t.integer('business_calendar_id').unsigned().nullable();
      t.boolean('pause_on_waiting').notNullable().defaultTo(true);
      t.jsonb('pause_stages').nullable();
      t.boolean('is_default').notNullable().defaultTo(false);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.dateTime('created_at', { precision: 3 }).notNullable();
      t.dateTime('updated_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_sla_policies_document_id_unq',
        (t) => t.unique(['document_id'], { indexName: 'helpdesk_sla_policies_document_id_unq' })],
      ['helpdesk_sla_policies_key_unq',
        (t) => t.unique(['key'], { indexName: 'helpdesk_sla_policies_key_unq' })],
      ['helpdesk_sla_policies_desk_idx',
        (t) => t.index(['desk_id', 'is_active'], 'helpdesk_sla_policies_desk_idx')],
      ['helpdesk_sla_policies_default_idx',
        (t) => t.index(['is_default', 'is_active'], 'helpdesk_sla_policies_default_idx')],
    ],
  },
  {
    name: TARGETS,
    columns: (t) => {
      t.increments('id').primary();
      t.string('document_id', 64).notNullable();
      t.integer('policy_id').unsigned().notNullable();
      t.string('priority', 16).notNullable();
      // Business minutes, not wall-clock minutes (RULE-8). Nullable means the
      // policy makes no promise on that clock for that priority — a different
      // statement from promising zero.
      t.integer('first_response_minutes').nullable();
      t.integer('resolution_minutes').nullable();
      t.integer('at_risk_threshold_pct').notNullable().defaultTo(80);
      t.jsonb('escalation_steps').nullable();
      t.dateTime('created_at', { precision: 3 }).notNullable();
      t.dateTime('updated_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_sla_targets_document_id_unq',
        (t) => t.unique(['document_id'], { indexName: 'helpdesk_sla_targets_document_id_unq' })],
      // One target per priority per policy — the resolution order picks a
      // policy, and the policy must then answer unambiguously.
      ['helpdesk_sla_targets_policy_priority_unq',
        (t) => t.unique(['policy_id', 'priority'], { indexName: 'helpdesk_sla_targets_policy_priority_unq' })],
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
  name: '013-helpdesk-sla',

  async up(knex) {
    for (const table of TABLES) {
      if (!(await knex.schema.hasTable(table.name))) {
        await knex.schema.createTable(table.name, table.columns);
        console.log(`[migrate] created ${table.name}`);
      }
      // Applied separately from CREATE TABLE and guarded individually: knex
      // emits each index as its own ALTER and MySQL commits each one, so an
      // interrupted run must be able to finish the set on the next attempt.
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
