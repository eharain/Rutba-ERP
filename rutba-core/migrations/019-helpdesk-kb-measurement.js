'use strict';

/**
 * Knowledge base measurement — the feedback/deflection ledger and the
 * zero-result rollup (spec 11 §11.6, §11.10; spec 26 §26.10).
 *
 * SEPARATE FROM 018 BECAUSE IT ANSWERS A DIFFERENT QUESTION. 018 is the
 * content model; this is the evidence that the content works. They have
 * different write rates, different retention pressure and different reasons to
 * change, and splitting them means the measurement half can be dropped and
 * rebuilt without touching a single article.
 *
 * WHY A LEDGER AND NOT JUST THE COUNTERS ON THE ARTICLE. Two reasons, both
 * load-bearing:
 *
 *  - `POST /feedback` is reachable by an unauthenticated reader. A bare
 *    counter bump is a vote button anyone can hold down, and a helpfulness
 *    ratio built from that number is worse than no ratio, because it looks
 *    like evidence. The (article, session_key, kind) unique index is what makes
 *    a vote idempotent per reader.
 *  - §11.6 requires deflection AND failed deflection to be reported. Both are
 *    per-reader events with a session behind them, not aggregate counts: the
 *    same reader opening an article and then raising a ticket anyway is ONE
 *    failed deflection, however many times they refresh.
 *
 * The counters on helpdesk_kb_articles stay — they are the read model, kept in
 * step by the service inside the same transaction as the ledger row — because
 * ranking by helpfulness (§11.5) must not aggregate this table per query.
 *
 * SESSION KEYS ARE OPAQUE AND CLIENT-SUPPLIED, WITH A DERIVED FALLBACK. The
 * requester surface knows whether the form was abandoned; the server does not.
 * A session key is therefore the client's assertion about "the same reader,
 * the same visit", and the fallback (a hash of ip + user agent + day) exists so
 * an anonymous reader who sends nothing still cannot vote a thousand times. It
 * is a rate limit expressed as a key, not an identity — and deliberately NOT a
 * raw ip, which would make this table a log of who read which help article.
 *
 * ZERO-RESULT QUERIES ARE ROLLED UP, NOT LOGGED. §11.10 wants "top search terms
 * with no result" — a ranked list, not an audit trail. One row per
 * (tenant, normalized query, surface) with an occurrence counter answers that
 * in an ORDER BY, and cannot grow without bound the way an append-only log of
 * every miss would.
 *
 * No foreign keys and guarded index passes, per 011.
 */

const FEEDBACK = 'helpdesk_kb_article_feedback';
const SEARCH_MISSES = 'helpdesk_kb_search_misses';

const TABLES = [
  {
    name: FEEDBACK,
    columns: (t) => {
      t.increments('id').primary();
      t.string('document_id', 64).notNullable();
      t.string('tenant_id', 60).notNullable().defaultTo('');

      t.integer('article_id').unsigned().notNullable();
      // helpful | unhelpful | deflected | failed_deflection
      t.string('kind', 20).notNullable();

      t.string('session_key', 191).notNullable();
      t.integer('user_id').unsigned().nullable();
      // public | portal | agent — which surface the signal came from, so a
      // helpfulness ratio can be read per audience rather than as one blended
      // number that describes nobody.
      t.string('surface', 20).notNullable().defaultTo('public');

      t.string('comment', 1000).nullable();
      // The ticket raised in spite of the article, when the surface knows it.
      // This is what turns a failed deflection from a tally into something an
      // author can act on: the ticket says what the article failed to answer.
      t.integer('ticket_id').unsigned().nullable();

      t.dateTime('created_at', { precision: 3 }).notNullable();
      t.dateTime('updated_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_kb_article_feedback_document_id_unq',
        (t) => t.unique(['document_id'], { indexName: 'helpdesk_kb_article_feedback_document_id_unq' })],
      // One signal of each kind per reader per article. A reader flipping
      // helpful → unhelpful updates their existing row (KbArticleService),
      // which is why the kind is part of the key rather than the whole of it.
      ['helpdesk_kb_article_feedback_unq',
        (t) => t.unique(['article_id', 'session_key', 'kind'], { indexName: 'helpdesk_kb_article_feedback_unq' })],
      ['helpdesk_kb_article_feedback_report_idx',
        (t) => t.index(['tenant_id', 'article_id', 'kind'], 'helpdesk_kb_article_feedback_report_idx')],
      ['helpdesk_kb_article_feedback_recent_idx',
        (t) => t.index(['tenant_id', 'created_at'], 'helpdesk_kb_article_feedback_recent_idx')],
    ],
  },
  {
    name: SEARCH_MISSES,
    columns: (t) => {
      t.increments('id').primary();
      t.string('tenant_id', 60).notNullable().defaultTo('');

      // What was typed, and the casefolded/collapsed form the rollup keys on.
      t.string('query', 191).notNullable();
      t.string('normalized', 191).notNullable();
      // agent | requester | public — the same term missing on the public help
      // pages and in the agent workspace are two different content gaps.
      t.string('surface', 20).notNullable().defaultTo('public');

      t.integer('occurrences').notNullable().defaultTo(1);
      t.dateTime('first_seen_at', { precision: 3 }).notNullable();
      t.dateTime('last_seen_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_kb_search_misses_unq',
        (t) => t.unique(['tenant_id', 'normalized', 'surface'], { indexName: 'helpdesk_kb_search_misses_unq' })],
      // The report: most-wanted missing answers first.
      ['helpdesk_kb_search_misses_top_idx',
        (t) => t.index(['tenant_id', 'surface', 'occurrences'], 'helpdesk_kb_search_misses_top_idx')],
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
  name: '019-helpdesk-kb-measurement',

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
