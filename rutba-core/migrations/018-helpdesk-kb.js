'use strict';

/**
 * Knowledge base — categories, articles, immutable versions, and the two link
 * tables (spec 11 §11.3).
 *
 * Core-owned like every other helpdesk table: absent from pos-strapi's
 * schema.json, invisible to the schema registry, documents() and Strapi admin,
 * and reached through knex by repository/kb.repo.js. See 011's docblock for the
 * standing decisions this migration inherits — NO FOREIGN KEYS ANYWHERE, and
 * indexes applied through their own guarded pass rather than inside
 * createTable, because MySQL implicitly commits each ALTER and a migration that
 * dies between them would leave a table whose hasTable guard now says "done"
 * and whose constraints were never applied.
 *
 * WHY `tenant_id` IS HERE WHEN NO OTHER HELPDESK TABLE HAS IT. Spec 34 T1
 * forbids global uniqueness assumptions, and a slug is the one identifier in
 * this module that is BOTH user-authored and reachable by URL — `/help/{slug}`.
 * A bare unique index on it would be exactly the "hardest thing to unpick
 * later" T1 names. The column is varchar NOT NULL DEFAULT '' rather than
 * nullable on purpose: MySQL treats NULLs as distinct in a unique index, so a
 * nullable tenant column would silently stop enforcing slug uniqueness in the
 * single-tenant deployment we actually run today.
 *
 * This is NOT a decision that isolation is row-level — spec 34 §34.4 leaves
 * that to the platform program, and the memoed direction is database-per-
 * tenant. Under database-per-tenant the column is a constant and the composite
 * index behaves exactly like the plain one; under row-level it is already
 * right. It costs one narrow column to be correct either way, which is the
 * whole of §34.2's "never write code that makes tenancy harder".
 *
 * `attachment_ids` IS A JSON ARRAY OF FILE IDS, NOT A MEDIA RELATION. Strapi
 * models media through files_related_mph, which the schema registry owns and
 * Strapi's boot-time sync rewrites; a Core-owned table cannot participate in it
 * without becoming a second writer of a table pos-strapi believes it owns. The
 * ids are resolved through the upload platform on read.
 *
 * `source_kind` / `source_ref` ARE FOR THE PUBLISHER THAT DOES NOT EXIST YET.
 * The standing decision is that repo markdown is the source and the KB renders
 * it; the columns let an article say where it came from so that slice is an
 * additive change rather than a migration on a populated table. Nothing writes
 * anything but 'manual' today.
 *
 * DESKS ARE A LINK TABLE, RELATED ARTICLES ARE TOO, AND THAT IS NOT SYMMETRY
 * FOR ITS OWN SAKE. Both are queried: desk tags drive the agent app's desk
 * filter and the suggestion ranking, and the related edge is read in reverse
 * when archiving — "three published articles link to this one" is the thing an
 * archiver needs to know and a json column could not answer.
 */

const CATEGORIES = 'helpdesk_kb_categories';
const ARTICLES = 'helpdesk_kb_articles';
const VERSIONS = 'helpdesk_kb_article_versions';
const ARTICLE_DESKS = 'helpdesk_kb_article_desks';
const ARTICLE_RELATED = 'helpdesk_kb_article_related';

const TABLES = [
  {
    name: CATEGORIES,
    columns: (t) => {
      t.increments('id').primary();
      t.string('document_id', 64).notNullable();
      t.string('tenant_id', 60).notNullable().defaultTo('');

      t.string('key', 60).notNullable();
      t.string('name', 191).notNullable();
      t.text('description').nullable();
      t.string('icon', 60).nullable();

      // Self-relation, max depth 3 (§11.3). `depth` is materialised so the
      // limit is one comparison rather than a recursive walk on every write,
      // and so a tree render can order by it without re-deriving it. Root = 0,
      // so the legal range is 0..2 and KbCategoryService owns the check.
      t.integer('parent_id').unsigned().nullable();
      t.integer('depth').notNullable().defaultTo(0);
      t.integer('sequence').notNullable().defaultTo(0);

      // public | internal | both — which TREE the category appears in, and the
      // per-category configuration behind spec 29 §29.7's ⚙️ on
      // `kb.read.internal` for customers. See policy/kb-visibility.js: an
      // account-holding customer reads an `internal` ARTICLE only inside a
      // category the tenant has chosen to show on the requester surface.
      t.string('visibility', 16).notNullable().defaultTo('both');
      t.boolean('is_active').notNullable().defaultTo(true);

      t.dateTime('created_at', { precision: 3 }).notNullable();
      t.dateTime('updated_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_kb_categories_document_id_unq',
        (t) => t.unique(['document_id'], { indexName: 'helpdesk_kb_categories_document_id_unq' })],
      // T1: per tenant, never global.
      ['helpdesk_kb_categories_key_unq',
        (t) => t.unique(['tenant_id', 'key'], { indexName: 'helpdesk_kb_categories_key_unq' })],
      ['helpdesk_kb_categories_tree_idx',
        (t) => t.index(['tenant_id', 'parent_id', 'sequence'], 'helpdesk_kb_categories_tree_idx')],
      ['helpdesk_kb_categories_visible_idx',
        (t) => t.index(['tenant_id', 'is_active', 'visibility'], 'helpdesk_kb_categories_visible_idx')],
    ],
  },
  {
    name: ARTICLES,
    columns: (t) => {
      t.increments('id').primary();
      t.string('document_id', 64).notNullable();
      t.string('tenant_id', 60).notNullable().defaultTo('');

      t.string('title', 255).notNullable();
      t.string('slug', 191).notNullable();
      t.integer('category_id').unsigned().nullable();

      // public | internal | agent_only — three audiences, deliberately (§11.3).
      // DEFAULTS TO THE MOST RESTRICTIVE TIER. An article whose author never
      // said who it was for must not be the one that reaches a customer, and
      // the direction to be wrong in is "an agent cannot find it yet".
      t.string('visibility', 16).notNullable().defaultTo('agent_only');
      // draft | in_review | published | archived (§11.4).
      t.string('status', 16).notNullable().defaultTo('draft');

      t.text('summary').nullable();
      t.mediumtext('body').nullable();
      // text | html | markdown. The richtext of §11.3 plus the format flag the
      // repo-markdown publisher will need; message.repo.js carries the same.
      t.string('body_format', 16).notNullable().defaultTo('markdown');

      t.string('locale', 10).notNullable().defaultTo('en');
      t.integer('translation_of_id').unsigned().nullable();

      t.jsonb('tags').nullable();
      t.jsonb('attachment_ids').nullable();

      t.integer('author_id').unsigned().nullable();
      t.integer('reviewer_id').unsigned().nullable();

      t.dateTime('published_at', { precision: 3 }).nullable();
      t.dateTime('review_due_at', { precision: 3 }).nullable();
      t.dateTime('archived_at', { precision: 3 }).nullable();

      t.integer('view_count').notNullable().defaultTo(0);
      t.integer('helpful_count').notNullable().defaultTo(0);
      t.integer('unhelpful_count').notNullable().defaultTo(0);
      t.integer('deflection_count').notNullable().defaultTo(0);
      // §11.6 requires BOTH numbers. A KB report that only counts successes
      // teaches nobody anything, so the failure has a column of its own rather
      // than being derivable only by subtraction from a number nothing stores.
      t.integer('failed_deflection_count').notNullable().defaultTo(0);

      t.integer('source_ticket_id').unsigned().nullable();
      // manual | ticket | repo — provenance for the publisher slice.
      t.string('source_kind', 20).notNullable().defaultTo('manual');
      t.string('source_ref', 255).nullable();

      // The version number of the last publish; 0 until first published.
      t.integer('version').notNullable().defaultTo(0);

      t.dateTime('created_at', { precision: 3 }).notNullable();
      t.dateTime('updated_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_kb_articles_document_id_unq',
        (t) => t.unique(['document_id'], { indexName: 'helpdesk_kb_articles_document_id_unq' })],
      // T1 again, and locale is part of the key because a translation is the
      // same article at the same address in another language (§11.3).
      ['helpdesk_kb_articles_slug_unq',
        (t) => t.unique(['tenant_id', 'locale', 'slug'], { indexName: 'helpdesk_kb_articles_slug_unq' })],
      // The read model's hot path: published articles of the tiers this actor
      // may see, newest first.
      ['helpdesk_kb_articles_read_idx',
        (t) => t.index(['tenant_id', 'status', 'visibility', 'published_at'], 'helpdesk_kb_articles_read_idx')],
      ['helpdesk_kb_articles_category_idx',
        (t) => t.index(['tenant_id', 'category_id', 'status'], 'helpdesk_kb_articles_category_idx')],
      // The staleness sweep (§11.4) scans exactly this.
      ['helpdesk_kb_articles_review_idx',
        (t) => t.index(['tenant_id', 'status', 'review_due_at'], 'helpdesk_kb_articles_review_idx')],
      ['helpdesk_kb_articles_source_ticket_idx',
        (t) => t.index(['tenant_id', 'source_ticket_id'], 'helpdesk_kb_articles_source_ticket_idx')],
      ['helpdesk_kb_articles_translation_idx',
        (t) => t.index(['translation_of_id'], 'helpdesk_kb_articles_translation_idx')],
    ],
  },
  {
    name: VERSIONS,
    columns: (t) => {
      t.increments('id').primary();
      t.string('document_id', 64).notNullable();
      t.string('tenant_id', 60).notNullable().defaultTo('');

      t.integer('article_id').unsigned().notNullable();
      t.integer('version').notNullable();

      t.string('title', 255).notNullable();
      t.text('summary').nullable();
      t.mediumtext('body').nullable();
      t.string('body_format', 16).notNullable().defaultTo('markdown');

      t.integer('published_by').unsigned().nullable();
      t.dateTime('published_at', { precision: 3 }).notNullable();
      t.string('change_note', 500).nullable();

      // Set when this version was produced BY a rollback, naming the version it
      // restored. §11.4 requires rollback to create a new version rather than
      // mutate history; without this column the new version is indistinguish-
      // able from an ordinary edit and the history stops explaining itself.
      t.integer('rolled_back_from').nullable();

      t.dateTime('created_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_kb_article_versions_document_id_unq',
        (t) => t.unique(['document_id'], { indexName: 'helpdesk_kb_article_versions_document_id_unq' })],
      // The immutability guarantee, in the schema: one row per (article,
      // version), so a second write of the same number fails rather than
      // overwriting the snapshot somebody may be relying on.
      ['helpdesk_kb_article_versions_unq',
        (t) => t.unique(['article_id', 'version'], { indexName: 'helpdesk_kb_article_versions_unq' })],
      ['helpdesk_kb_article_versions_article_idx',
        (t) => t.index(['tenant_id', 'article_id'], 'helpdesk_kb_article_versions_article_idx')],
    ],
  },
  {
    name: ARTICLE_DESKS,
    columns: (t) => {
      t.increments('id').primary();
      t.integer('article_id').unsigned().notNullable();
      t.integer('desk_id').unsigned().notNullable();
      t.dateTime('created_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_kb_article_desks_unq',
        (t) => t.unique(['article_id', 'desk_id'], { indexName: 'helpdesk_kb_article_desks_unq' })],
      // "Articles tagged to this desk" — the suggestion query's first narrowing.
      ['helpdesk_kb_article_desks_desk_idx',
        (t) => t.index(['desk_id'], 'helpdesk_kb_article_desks_desk_idx')],
    ],
  },
  {
    name: ARTICLE_RELATED,
    columns: (t) => {
      t.increments('id').primary();
      t.integer('article_id').unsigned().notNullable();
      t.integer('related_article_id').unsigned().notNullable();
      t.dateTime('created_at', { precision: 3 }).notNullable();
    },
    indexes: [
      ['helpdesk_kb_article_related_unq',
        (t) => t.unique(['article_id', 'related_article_id'], { indexName: 'helpdesk_kb_article_related_unq' })],
      // The reverse read: who points at me, asked before archiving.
      ['helpdesk_kb_article_related_target_idx',
        (t) => t.index(['related_article_id'], 'helpdesk_kb_article_related_target_idx')],
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
  name: '018-helpdesk-kb',

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
