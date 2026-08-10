'use strict';

/**
 * M1 + M2 — extend contact_tickets for the Helpdesk aggregate (spec 07 §7.3).
 *
 * This is the one migration in the program that touches a table pos-strapi
 * still owns and that holds live rows, so it is the one with a second gate on
 * top of the runner's: rutba-core derives every table it knows about from
 * pos-strapi's schema.json files (src/schema/registry.js) and
 * scripts/validate-schema.js asserts that derivation matches the live database
 * byte-for-byte. The columns added here are EXACTLY what the attributes added
 * to contact-ticket/schema.json in the same commit derive to — nothing more,
 * nothing less. Add a column here without the attribute (or the reverse) and
 * validate-schema reports a diff, at which point the documents() shim is no
 * longer trustworthy for any model.
 *
 * WHY THERE ARE NO NEW RELATIONS. Strapi 5 stores every relation in a link
 * table (contact_tickets_person_lnk and friends), never in an FK column on the
 * entity row. Three consequences drove the design:
 *   - Desk, Team, SlaPolicy, ResolutionCode and ServiceCatalogItem live in
 *     Core-owned helpdesk_* tables that are deliberately absent from the schema
 *     registry. A schema.json relation whose target is not a registered model
 *     breaks pos-strapi at boot, so those references cannot be relations at all.
 *   - The queue and sweep queries the module lives on need composite indexes —
 *     (desk, status), (branch, status), (status, resolution_due_at). A value in
 *     a link table cannot participate in an index on contact_tickets, so a
 *     relation would have made spec 35 §35.4's Q1/Q4 unservable by design.
 *   - Every new link table is more derivation surface on the gate above.
 * So each reference is a plain integer id column, following the pattern
 * cash_registers already uses (desk_id, branch_id, opened_by_id). The joins are
 * written by hand in the helpdesk repositories, which use knex directly anyway.
 * The cost, accepted knowingly: documents() cannot populate or filter on these,
 * and Strapi admin shows them as bare numbers.
 *
 * NOTHING IS MARKED `required` IN schema.json, on purpose. Strapi enforces
 * `required` in content-API validation, not in DDL — so marking priority or
 * source required would leave the columns nullable but start rejecting the
 * legacy submit / submitInternalTicket creates that omit them, breaking the
 * public storefront flow standing decision 1 promises to keep working.
 * Requiredness is TicketService's job. The `default` values in schema.json are
 * likewise app-layer only: Strapi applies them on create, Core's documents()
 * shim does not, and neither writes a DDL default.
 *
 * COLUMN SHAPES mirror @strapi/database's getColumnType exactly, because
 * Strapi diffs type, nullability, default and unsignedness on boot and issues
 * an ALTER for anything that disagrees:
 *   integer→int  string/enumeration→varchar(255)  text→longtext  json→json
 *   datetime→datetime(6)  biginteger→bigint  boolean→tinyint(1)
 * All nullable, no DDL default, not unsigned — which is also what "additive
 * only on a table holding live rows" requires.
 *
 * The indexes added here are invisible to Strapi's sync: its diff only drops an
 * index that is in the schema it previously persisted, and these never were.
 */

const TABLE = 'contact_tickets';

// attr name → the knex call that reproduces Strapi's DDL for that attribute type.
const COLUMNS = [
  ['desk_id', (t, n) => t.integer(n)],
  ['priority', (t, n) => t.string(n)],
  ['source', (t, n) => t.string(n)],
  ['requester_kind', (t, n) => t.string(n)],
  ['branch_id', (t, n) => t.integer(n)],
  ['team_id', (t, n) => t.integer(n)],
  ['subject_entity_uid', (t, n) => t.string(n)],
  ['subject_document_id', (t, n) => t.string(n)],
  ['catalog_item_id', (t, n) => t.integer(n)],
  ['custom_fields', (t, n) => t.jsonb(n)],
  ['workflow_id', (t, n) => t.integer(n)],
  ['stage_key', (t, n) => t.string(n)],
  ['sla_policy_id', (t, n) => t.integer(n)],
  ['first_response_due_at', (t, n) => t.datetime(n, { useTz: false, precision: 6 })],
  ['first_response_at', (t, n) => t.datetime(n, { useTz: false, precision: 6 })],
  ['resolution_due_at', (t, n) => t.datetime(n, { useTz: false, precision: 6 })],
  ['sla_state', (t, n) => t.string(n)],
  ['sla_paused_at', (t, n) => t.datetime(n, { useTz: false, precision: 6 })],
  // Milliseconds overflow a signed int after 24.8 days, and a ticket parked on
  // a customer for a month is ordinary. Read it through Number() at the
  // boundary: both mysql2 and Strapi hand a BIGINT back as a string.
  ['sla_paused_ms', (t, n) => t.bigInteger(n)],
  ['resolution', (t, n) => t.text(n, 'longtext')],
  ['resolution_code_id', (t, n) => t.integer(n)],
  ['closed_at', (t, n) => t.datetime(n, { useTz: false, precision: 6 })],
  ['reopened_count', (t, n) => t.integer(n)],
  ['merged_into_id', (t, n) => t.integer(n)],
  ['split_from_id', (t, n) => t.integer(n)],
  ['tags', (t, n) => t.jsonb(n)],
  ['is_imported', (t, n) => t.boolean(n)],
  ['origin_event', (t, n) => t.jsonb(n)],
  ['dedupe_key', (t, n) => t.string(n)],
  ['archived_at', (t, n) => t.datetime(n, { useTz: false, precision: 6 })],
];

const INDEXES = [
  // Q1, the queue. desk_id first so the (desk, status) prefix is served by the
  // same index — one index, not two.
  ['contact_tickets_queue_idx', ['desk_id', 'status', 'priority', 'resolution_due_at']],
  // Q4, the SLA sweep.
  ['contact_tickets_sla_sweep_idx', ['status', 'resolution_due_at']],
  // Q2, "what is breaching" — the reason sla_state is materialised at all.
  ['contact_tickets_sla_state_idx', ['sla_state', 'resolution_due_at']],
  // "tickets about this entity". Two varchar(255) utf8mb4 columns are 2040
  // bytes, inside InnoDB's 3072-byte key limit on the MySQL 8 that Strapi 5
  // requires; on the older 767-byte limit this would need prefix lengths.
  ['contact_tickets_subject_ref_idx', ['subject_entity_uid', 'subject_document_id']],
  ['contact_tickets_branch_status_idx', ['branch_id', 'status']],
  // Lookup only. The "unique among non-terminal tickets" guarantee lives in
  // helpdesk_ticket_dedupe (migration 014) — a partial unique index cannot be
  // expressed here, and a generated column would show up as an undeclared
  // column and break validate-schema.
  ['contact_tickets_dedupe_key_idx', ['dedupe_key']],
];

const NEW_STATUSES = ['closed', 'cancelled', 'merged'];

function isMysql(knex) {
  return /mysql/i.test(String(knex.client.config.client || ''));
}

async function hasIndex(knex, table, name) {
  const database = knex.client.config.connection.database;
  if (isMysql(knex)) {
    const row = await knex('information_schema.statistics')
      .where({ table_schema: database, table_name: table, index_name: name })
      .first('INDEX_NAME as index_name');
    return Boolean(row);
  }
  const row = await knex('pg_indexes').where({ tablename: table, indexname: name }).first('indexname');
  return Boolean(row);
}

/**
 * The status enum extension is a schema.json change and normally nothing else:
 * Strapi maps `enumeration` to varchar(255), so the four new values simply
 * become storable. If some hand-rolled DDL ever turned the column into a real
 * MySQL ENUM, an insert of 'closed' would fail at runtime with a truncation
 * error far from its cause — so detect that here and refuse. Refusing rather
 * than issuing the ALTER is deliberate: rebuilding a live column's definition
 * from information_schema risks silently changing its charset, nullability or
 * default, which is exactly what "never alter an existing column" forbids.
 */
async function assertStatusAcceptsNewValues(knex) {
  if (!isMysql(knex)) return;
  const row = await knex('information_schema.columns')
    .where({
      table_schema: knex.client.config.connection.database,
      table_name: TABLE,
      column_name: 'status',
    })
    .first('DATA_TYPE as data_type', 'COLUMN_TYPE as column_type');
  if (!row || String(row.data_type).toLowerCase() !== 'enum') return;

  const declared = String(row.column_type);
  const missing = NEW_STATUSES.filter((v) => !declared.includes(`'${v}'`));
  if (!missing.length) return;
  throw new Error(
    `${TABLE}.status is a MySQL ENUM that does not accept ${missing.join(', ')}. ` +
    'Strapi creates enumeration attributes as varchar, so this column was changed outside ' +
    'the schema. Widen it by hand (ALTER TABLE contact_tickets MODIFY status ENUM(...) with ' +
    'the existing values plus the new ones, keeping charset/null/default identical), then ' +
    're-run this migration.'
  );
}

module.exports = {
  name: '010-contact-tickets-extend',

  async up(knex) {
    if (!(await knex.schema.hasTable(TABLE))) {
      throw new Error(`${TABLE} does not exist — this migration extends the live pos-strapi table`);
    }
    await assertStatusAcceptsNewValues(knex);

    const missing = [];
    for (const [name, add] of COLUMNS) {
      if (!(await knex.schema.hasColumn(TABLE, name))) missing.push([name, add]);
    }
    if (missing.length) {
      // One ALTER, not thirty: MySQL rebuilds the table per statement.
      await knex.schema.alterTable(TABLE, (t) => {
        for (const [name, add] of missing) add(t, name);
      });
      console.log(`[migrate] ${TABLE}: added ${missing.length} column(s)`);
    }

    for (const [name, columns] of INDEXES) {
      if (await hasIndex(knex, TABLE, name)) continue;
      await knex.schema.alterTable(TABLE, (t) => t.index(columns, name));
      console.log(`[migrate] ${TABLE}: created index ${name}`);
    }
  },

  async down(knex) {
    for (const [name] of INDEXES) {
      if (!(await hasIndex(knex, TABLE, name))) continue;
      await knex.schema.alterTable(TABLE, (t) => t.dropIndex([], name));
    }
    const present = [];
    for (const [name] of COLUMNS) {
      if (await knex.schema.hasColumn(TABLE, name)) present.push(name);
    }
    if (present.length) {
      await knex.schema.alterTable(TABLE, (t) => t.dropColumns(...present));
    }
    // The status enum values are not removed: rolling them back would have to
    // rewrite rows that already reached closed/cancelled/merged, and losing a
    // ticket's real state to undo a schema change is never the right trade.
    // Revert contact-ticket/schema.json by hand alongside this.
  },
};
