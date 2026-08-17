'use strict';

/**
 * M4 — helpdesk_ticket_messages (spec 07 §7.4).
 *
 * This table is the fix for the module's central defect. Today the only reply
 * storage is contact-ticket's addReply, which writes
 *   metadata: { ...metadata, latest_reply, latest_reply_by_user_id }
 * so every reply overwrites the previous one. A ticket with nine exchanges
 * keeps exactly one sentence, and there is no thread at any point. Migration
 * 016 recovers the surviving fragment; from here on the thread is rows.
 *
 * WHY A DEDICATED TABLE rather than the generic work-item-comment store (the
 * decision spec §7.4 asks to be ratified): work-item-comment's find route is
 * already exposed to manufacturing and order-management, and each additional
 * consumer widens the surface on which one authorization mistake leaks internal
 * notes across modules. The ticket thread has by far the highest
 * confidentiality stakes in the ERP and materially different requirements —
 * channels, per-recipient delivery state, redaction, inbound idempotency — so
 * it gets its own table behind its own single gate. Ratified as specified.
 *
 * THE INTERNAL/PUBLIC SPLIT IS A READ-MODEL CONCERN. `visibility` exists so the
 * requester-facing query can be `where visibility = 'public'` in SQL. It must
 * never be enforced by filtering a full thread in a caller or a component: the
 * one call site that forgets is a disclosure, and helpdesk_ticket_messages_
 * public_idx below exists to make the safe query the fast one too.
 *
 * APPEND-ONLY. There is no edit path and no update route in the spec; the only
 * mutation is redaction, which tombstones a row (redacted_at / redacted_by /
 * redaction_reason), is admin-only and is audited. updated_at is here for that
 * one write and for delivery-state updates on outbound messages.
 *
 * No FK to contact_tickets, and no FKs anywhere in the helpdesk tables — see
 * 011 for the reasoning. Tickets are evidence and are archived, not deleted
 * (RULE-13); orphan messages are a reporting query, not a constraint.
 *
 * Attachments are not modelled here. Media lives in files_related_mph keyed by
 * (related_type, related_id, field), which is spec 25's problem and needs no
 * column on this table.
 */

const TABLE = 'helpdesk_ticket_messages';

const INDEXES = [
  ['helpdesk_ticket_messages_document_id_unq',
    (t) => t.unique(['document_id'], { indexName: 'helpdesk_ticket_messages_document_id_unq' })],
  // Q3: the agent's thread read.
  ['helpdesk_ticket_messages_thread_idx',
    (t) => t.index(['ticket_id', 'created_at'], 'helpdesk_ticket_messages_thread_idx')],
  // The requester's thread read. Same query with the visibility predicate
  // pushed into the index, so the portal never pays for rows it may not see.
  ['helpdesk_ticket_messages_public_idx',
    (t) => t.index(['ticket_id', 'visibility', 'created_at'], 'helpdesk_ticket_messages_public_idx')],
  // Inbound idempotency: a redelivered email or webhook collides here instead
  // of duplicating the thread. MySQL treats NULLs as distinct in a unique
  // index, so locally-authored messages (no external_id) are unaffected — that
  // is the "unique-partial where not null" spec §7.4 asks for, without needing
  // a partial index.
  ['helpdesk_ticket_messages_external_unq',
    (t) => t.unique(['channel', 'external_id'], { indexName: 'helpdesk_ticket_messages_external_unq' })],
  // "Show me this ticket's first response" and the SLA first-response stamp.
  ['helpdesk_ticket_messages_first_resp_idx',
    (t) => t.index(['ticket_id', 'is_first_response'], 'helpdesk_ticket_messages_first_resp_idx')],
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
  name: '012-helpdesk-ticket-messages',

  async up(knex) {
    if (!(await knex.schema.hasTable(TABLE))) {
      await knex.schema.createTable(TABLE, (t) => {
        // The thread is the highest-volume table in the module and spec §37.5
        // anticipates partitioning it by month at scale, so the key is a bigint
        // from the start — widening a primary key later is a rewrite.
        t.bigIncrements('id').primary();
        t.string('document_id', 64).notNullable();

        t.integer('ticket_id').unsigned().notNullable();
        t.text('body', 'longtext').notNullable();
        // text | html | markdown. HTML is sanitised on write by MessageService,
        // never on read — a sanitiser on the read path runs on every render and
        // still leaves the unsafe value in the database.
        t.string('body_format', 16).notNullable().defaultTo('text');
        // public | internal (RULE-10).
        t.string('visibility', 16).notNullable().defaultTo('public');

        t.integer('author_id').unsigned().nullable();
        // requester | agent | system | automation | ai. Null author_id with a
        // non-null author_kind is the normal case for the last three.
        t.string('author_kind', 24).notNullable().defaultTo('agent');
        // Snapshotted at write time: the thread must still read correctly after
        // the author is renamed, transferred or offboarded.
        t.string('author_label', 191).nullable();
        t.string('channel', 24).nullable();

        t.bigInteger('in_reply_to_id').unsigned().nullable();
        // Email Message-ID, WhatsApp id, marketplace message id. Carries the
        // inbound idempotency guarantee together with channel.
        t.string('external_id', 191).nullable();
        t.jsonb('delivery_state').nullable();

        t.dateTime('redacted_at', { precision: 3 }).nullable();
        t.integer('redacted_by').unsigned().nullable();
        t.string('redaction_reason', 255).nullable();

        t.boolean('is_first_response').notNullable().defaultTo(false);

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
