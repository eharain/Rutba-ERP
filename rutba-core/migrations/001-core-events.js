'use strict';

/**
 * The domain event bus's two tables (helpdesk program prerequisite P1,
 * spec 28.9). Consumed only by src/platform/events.js.
 *
 * These are Core-owned tables: they are deliberately absent from pos-strapi's
 * schema.json, so the schema registry, documents() and Strapi admin cannot see
 * them and events.js talks to them through knex directly. Nothing here touches
 * an existing table, so this migration cannot damage live pos-strapi data.
 *
 * Deliveries carry NO foreign key to core_events. A cascade is forbidden
 * program-wide, and a RESTRICT constraint would only get in the purge's way —
 * the purge deletes both sides in order, and the dispatcher joins on event_id.
 *
 * Column widths are chosen against MySQL's 767-byte index-prefix limit under
 * utf8mb4 (4 bytes/char), the same constraint that made core_migrations.name
 * varchar(191):
 *   (entity_uid 120 + document_id 60) * 4 = 720 bytes
 *   (event_id 40 + subscriber 120)    * 4 = 640 bytes
 * Widening either column means re-checking that arithmetic, not just the type.
 */

const EVENTS = 'core_events';
const DELIVERIES = 'core_event_deliveries';

module.exports = {
  name: '001-core-events',

  async up(knex) {
    if (!(await knex.schema.hasTable(EVENTS))) {
      await knex.schema.createTable(EVENTS, (t) => {
        // Autoincrement is the dispatcher's ordering key: rows are inserted in
        // emit order inside the caller's transaction, so id ascending is the
        // per-aggregate order events actually happened in. occurred_at alone
        // cannot do this — two events in one transaction share a millisecond.
        t.bigIncrements('id').primary();
        t.string('event_id', 40).notNullable().unique();
        t.string('event_name', 120).notNullable();
        t.integer('version').notNullable().defaultTo(1);
        t.dateTime('occurred_at', { precision: 3 }).notNullable();
        t.string('tenant_id', 60).nullable();
        t.json('actor').nullable();
        t.string('entity_uid', 120).nullable();
        t.string('document_id', 60).nullable();
        t.json('payload').nullable();
        t.string('correlation_id', 64).nullable();
        t.string('causation_id', 40).nullable();
        t.dateTime('created_at', { precision: 3 }).notNullable();

        t.index(['entity_uid', 'document_id'], 'core_events_subject_idx');
        t.index(['event_name', 'occurred_at'], 'core_events_name_time_idx');
        t.index(['occurred_at'], 'core_events_time_idx');
        t.index(['correlation_id'], 'core_events_correlation_idx');
      });
      console.log(`[migrate] created ${EVENTS}`);
    }

    if (!(await knex.schema.hasTable(DELIVERIES))) {
      await knex.schema.createTable(DELIVERIES, (t) => {
        t.bigIncrements('id').primary();
        t.string('event_id', 40).notNullable();
        t.string('subscriber', 120).notNullable();
        // pending | delivered | failed | dead. Left as a plain string rather
        // than an enum so adding a state later is a code change, not a DDL
        // change on a table that by then holds millions of rows.
        t.string('status', 16).notNullable().defaultTo('pending');
        t.integer('attempts').notNullable().defaultTo(0);
        t.dateTime('last_attempt_at', { precision: 3 }).nullable();
        // Null means "due now"; set on a retryable failure to hold the row
        // until its backoff elapses.
        t.dateTime('next_attempt_at', { precision: 3 }).nullable();
        t.text('last_error').nullable();
        t.dateTime('created_at', { precision: 3 }).notNullable();
        t.dateTime('updated_at', { precision: 3 }).notNullable();

        // One row per (event, subscriber) — this is what makes emit-time
        // fan-out safe to retry and makes a double dispatch impossible to
        // record twice.
        t.unique(['event_id', 'subscriber'], { indexName: 'core_event_deliveries_event_subscriber_unq' });
        t.index(['status', 'next_attempt_at'], 'core_event_deliveries_due_idx');
        t.index(['subscriber', 'status'], 'core_event_deliveries_subscriber_idx');
      });
      console.log(`[migrate] created ${DELIVERIES}`);
    }
  },

  async down(knex) {
    await knex.schema.dropTableIfExists(DELIVERIES);
    await knex.schema.dropTableIfExists(EVENTS);
  },
};
