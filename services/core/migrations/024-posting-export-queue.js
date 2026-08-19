'use strict';

/**
 * The posting export queue (portal task E1 × E2).
 *
 * Under the suite model an organisation may not have licensed `erp.gl`. It
 * still makes sales, still pays staff, still receives stock — and its
 * accountant, who works in some other system, still needs those numbers. The
 * brief's answer is an export-queue fallback: entries that cannot be posted are
 * captured here instead of being discarded.
 *
 * Discarding is the failure this table exists to prevent, and it is a quiet
 * one. Nothing errors when a module skips its posting step because the ledger
 * is not licensed; the sale completes, the books simply never learn about it,
 * and the gap is only discovered at year end by someone who cannot reconstruct
 * it. A row here is the difference between "exported later" and "gone".
 *
 * ── Why a table and not a job queue ───────────────────────────────────────
 *
 * This is a transactional outbox, not work to be processed. The rows are the
 * DELIVERABLE — an accountant exports them to a file — so they must outlive any
 * worker, survive restarts, and stay queryable by period and source. A Redis
 * queue would satisfy none of that, and the estate has a standing rule against
 * cross-product queues anyway.
 *
 * Core-owned: deliberately absent from services/strapi's schema.json, invisible to
 * the schema registry and documents(). Read and written through knex only,
 * exactly like core_policy_checkpoints.
 */

const TABLE = 'core_posting_exports';

module.exports = {
  name: '024-posting-export-queue',

  async up(knex) {
    if (await knex.schema.hasTable(TABLE)) return;
    await knex.schema.createTable(TABLE, (t) => {
      t.increments('id').primary();

      /**
       * `sourceType:sourceId[:discriminator]`, from the contract's
       * idempotencyKey(). UNIQUE, because the whole point is that a retried
       * webhook or a double-clicked Complete captures the sale once.
       *
       * Nullable, and that is deliberate: a Manual entry has no source document
       * and therefore no natural identity. MySQL permits many NULLs in a unique
       * index, so those rows coexist while every sourced entry stays unique —
       * which is the correct reading, since "no identity" must never collapse
       * two unrelated manual entries into one.
       *
       * varchar(191): the utf8mb4 index-prefix arithmetic (191 * 4 = 764 bytes,
       * under MySQL's 767), same as every other core-owned key column.
       */
      t.string('idempotency_key', 191).nullable().unique();

      // Denormalised out of the payload so the queue can be filtered by period,
      // branch and source without every row being parsed. The payload stays
      // the record of truth.
      t.string('source_type', 64).notNullable();
      t.integer('source_id').nullable();
      t.string('source_ref', 191).nullable();
      t.date('entry_date').notNullable();
      t.integer('branch_id').nullable();
      t.integer('currency_id').nullable();

      /**
       * Totals in MINOR UNITS (paisa), as integers — the same reason the
       * contract carries them that way. A decimal column here would reintroduce
       * at the storage layer exactly the drift the contract removes, and a
       * queue whose totals disagree with its own payload is worse than no
       * totals at all. `scale` records how to read them.
       */
      t.bigInteger('total_debit_minor').notNullable();
      t.bigInteger('total_credit_minor').notNullable();
      t.integer('scale').notNullable().defaultTo(2);

      /** The full entry, exactly as the contract's toExportPayload() emits it. */
      t.json('payload').notNullable();

      /**
       * pending  — captured, not yet handed to anyone
       * exported — included in an export the operator took
       * posted   — the org licensed erp.gl later and this was replayed into
       *            the ledger. Distinct from `exported` because the two have
       *            different consequences and conflating them would let an
       *            entry be both handed to an accountant and posted, i.e.
       *            counted twice.
       * failed   — replay or export refused it; `error` says why
       */
      t.enu('status', ['pending', 'exported', 'posted', 'failed']).notNullable().defaultTo('pending');
      t.text('error').nullable();

      t.dateTime('captured_at', { precision: 3 }).notNullable();
      t.dateTime('resolved_at', { precision: 3 }).nullable();

      // The queue is read one way in practice: "what is still pending, oldest
      // first". One index for that, rather than one per column nobody filters.
      t.index(['status', 'entry_date'], 'idx_posting_exports_status_date');
    });
  },

  async down(knex) {
    if (await knex.schema.hasTable(TABLE)) await knex.schema.dropTable(TABLE);
  },
};
