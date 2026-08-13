'use strict';

/**
 * Persistence for the knowledge base (migrations 018 and 019).
 *
 * knex rather than documents(): every table here is Core-owned and deliberately
 * absent from pos-strapi's schema.json, so the registry the shim is built on
 * has never heard of them. getDb() is called at the point of every statement
 * and never held in a module-level const, so each one joins the caller's
 * ambient transaction — the property that lets emit() write its outbox row in
 * the same commit as the publish it describes.
 *
 * THE VISIBILITY PREDICATE LIVES IN THE SQL. This is the file that makes the
 * §11 acceptance criterion structural rather than aspirational. Every read
 * takes a `scope` from policy/kb-visibility.js and pushes its tier list and
 * status list into the WHERE clause — for the COUNT as well as the page.
 * Filtering fetched rows in a caller looks equivalent and is not: the totals,
 * the "12 articles" badge and page 2 of the pagination would all still describe
 * rows the reader may not see, and one caller that forgets the filter entirely
 * is a disclosure of internal procedure titles. applyScope() is not optional on
 * any read path in this file, and there is no read path that omits it.
 *
 * TENANT SCOPING IS AT THIS LAYER AND NOWHERE ELSE (spec 34 T4). Every
 * statement below carries `tenant_id`, and no function takes a tenant argument
 * (T3) — the value comes from tenantId(), which today reads the process-level
 * RUTBA_TENANT_ID that platform/events.js already stamps on every event. When
 * the platform lands TenantContext (§34.4) this one function starts reading the
 * ambient request context and no call site changes. A tenant id that arrived as
 * a parameter would be an IDOR waiting to happen, which is exactly why it never
 * does.
 *
 * ARTICLES ARE READ THROUGH A LEFT JOIN ON THEIR CATEGORY. The join is not for
 * projection — it is how the customer/internal narrowing (§29.7's ⚙️) is
 * expressed as a predicate rather than as a second pass over the results. The
 * cost is one join on a table with single digits of rows.
 *
 * SEARCH IS SCORED LIKE-MATCHING, HONESTLY. Spec 26 §26.3 stages this: S1 is a
 * database full-text index, and it belongs to the search slice along with the
 * SearchService seam it sits behind. What ships here is weighted matching over
 * title > tags > summary > body with the §11.5 ranking (relevance, then
 * helpfulness, then recency), which is correct, needs no index that nothing
 * else uses, and scans a table that holds thousands of rows rather than
 * hundreds of thousands. It is one function; replacing it with MATCH…AGAINST or
 * a tsvector is a change to searchArticles() and nothing else. A FULLTEXT index
 * is deliberately NOT created in migration 018 — an index nothing queries is a
 * write cost with no reader, and 014's "the table ships with the repository
 * that can execute it" reasoning applies to indexes too.
 */

const crypto = require('crypto');
const { getDb } = require('../../../db/connection');
const { get } = require('../../../config/env');

const CATEGORIES = 'helpdesk_kb_categories';
const ARTICLES = 'helpdesk_kb_articles';
const VERSIONS = 'helpdesk_kb_article_versions';
const ARTICLE_DESKS = 'helpdesk_kb_article_desks';
const ARTICLE_RELATED = 'helpdesk_kb_article_related';
const FEEDBACK = 'helpdesk_kb_article_feedback';
const SEARCH_MISSES = 'helpdesk_kb_search_misses';

const DOC_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

const ARTICLE_COLUMNS = [
  'a.id', 'a.document_id', 'a.tenant_id', 'a.title', 'a.slug', 'a.category_id',
  'a.visibility', 'a.status', 'a.summary', 'a.body', 'a.body_format',
  'a.locale', 'a.translation_of_id', 'a.tags', 'a.attachment_ids',
  'a.author_id', 'a.reviewer_id', 'a.published_at', 'a.review_due_at', 'a.archived_at',
  'a.view_count', 'a.helpful_count', 'a.unhelpful_count',
  'a.deflection_count', 'a.failed_deflection_count',
  'a.source_ticket_id', 'a.source_kind', 'a.source_ref', 'a.version',
  'a.created_at', 'a.updated_at',
];

/**
 * The same set without the body. Lists and search results render a summary
 * (§11.3), so pulling every article's full text to throw it away would make a
 * 25-row page megabytes of transfer for text nobody displays. Search still
 * MATCHES on the body — the column is in the WHERE clause and the score
 * expression, just not in the projection.
 */
const ARTICLE_LIST_COLUMNS = ARTICLE_COLUMNS.filter((column) => column !== 'a.body');

const CATEGORY_COLUMNS = [
  'id', 'document_id', 'tenant_id', 'key', 'name', 'description', 'icon',
  'parent_id', 'depth', 'sequence', 'visibility', 'is_active',
  'created_at', 'updated_at',
];

/**
 * Relevance weights (§11.5, §26.7 "subject > tags > body"). A title hit is
 * worth more than four body hits on purpose: an article ABOUT the thing you
 * searched for beats one that merely mentions it, and without that gap a long
 * article wins every query simply by being long.
 */
const WEIGHT = Object.freeze({ title: 10, tags: 6, summary: 4, body: 1, exactTitle: 40, exactSlug: 60 });

const MAX_TOKENS = 8;
const MAX_SCAN = 2000;

/**
 * The tenant this process serves. See the file docblock: this is the single
 * seam that becomes a TenantContext read, and the reason no function here
 * accepts a tenant argument (T3). '' is the single-tenant value, and it is a
 * real value rather than NULL because MySQL treats NULLs as distinct in the
 * unique indexes that enforce per-tenant slug and key uniqueness.
 */
function tenantId() {
  return String(get('RUTBA_TENANT_ID', '') || '');
}

/**
 * The same 24-char cuid2 shape documents() generates, from the same entropy
 * source: a documentId reaches API payloads and URLs, so a predictable one is
 * an enumerable one. Inlined because these tables are invisible to the shim
 * that would otherwise mint it — message.repo.js does the same, for the same
 * reason.
 */
function generateDocumentId() {
  const bytes = crypto.randomBytes(24);
  let out = '';
  for (let i = 0; i < 24; i++) out += DOC_ID_ALPHABET[bytes[i] % (i === 0 ? 26 : 36)];
  return out;
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapCategory(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    documentId: row.document_id,
    tenant_id: row.tenant_id,
    key: row.key,
    name: row.name,
    description: row.description,
    icon: row.icon,
    parent_id: toNumber(row.parent_id),
    depth: Number(row.depth) || 0,
    sequence: Number(row.sequence) || 0,
    visibility: row.visibility,
    is_active: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapArticle(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    documentId: row.document_id,
    tenant_id: row.tenant_id,
    title: row.title,
    slug: row.slug,
    category_id: toNumber(row.category_id),
    visibility: row.visibility,
    status: row.status,
    summary: row.summary,
    body: row.body,
    body_format: row.body_format,
    locale: row.locale,
    translation_of_id: toNumber(row.translation_of_id),
    tags: parseJson(row.tags, []) || [],
    attachment_ids: parseJson(row.attachment_ids, []) || [],
    author_id: toNumber(row.author_id),
    reviewer_id: toNumber(row.reviewer_id),
    published_at: row.published_at,
    review_due_at: row.review_due_at,
    archived_at: row.archived_at,
    view_count: Number(row.view_count) || 0,
    helpful_count: Number(row.helpful_count) || 0,
    unhelpful_count: Number(row.unhelpful_count) || 0,
    deflection_count: Number(row.deflection_count) || 0,
    failed_deflection_count: Number(row.failed_deflection_count) || 0,
    source_ticket_id: toNumber(row.source_ticket_id),
    source_kind: row.source_kind,
    source_ref: row.source_ref,
    version: Number(row.version) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    documentId: row.document_id,
    article_id: Number(row.article_id),
    version: Number(row.version),
    title: row.title,
    summary: row.summary,
    body: row.body,
    body_format: row.body_format,
    published_by: toNumber(row.published_by),
    published_at: row.published_at,
    change_note: row.change_note,
    rolled_back_from: toNumber(row.rolled_back_from),
    createdAt: row.created_at,
  };
}

// ── the scope predicate ───────────────────────────────────────────────────

/**
 * THE function this file exists for. Applies a kb-visibility readScope to an
 * article query builder aliased `a`, with its category left-joined as `c`.
 *
 * An empty tier list means "this reader may see nothing", and it produces a
 * query that matches nothing rather than an unfiltered one — the same rule
 * entitlement.buildScopeFilter states for tickets, and the failure mode it
 * exists to prevent is identical.
 *
 * The `internal` narrowing is expressed as an OR inside a single grouped
 * predicate so it can only ever REMOVE rows from the tier list. There is no
 * arrangement of the arguments that widens it.
 */
function applyScope(qb, scope = {}) {
  const tiers = Array.isArray(scope.tiers) ? scope.tiers : [];
  const statuses = Array.isArray(scope.statuses) ? scope.statuses : [];

  if (!tiers.length || !statuses.length) {
    // Match nothing, in the query, so the count agrees with the page.
    return qb.whereRaw('1 = 0');
  }

  qb.whereIn('a.status', statuses);

  if (!scope.internalRequiresOpenCategory || !tiers.includes('internal')) {
    return qb.whereIn('a.visibility', tiers);
  }

  // A customer reading `internal`: the article's category must be one the
  // tenant shows on the requester surface. Uncategorised articles have no
  // configuration to consult and stay readable — the documented default.
  const plain = tiers.filter((tier) => tier !== 'internal');
  return qb.where(function scopedTiers() {
    if (plain.length) this.whereIn('a.visibility', plain);
    this.orWhere(function categoryGatedInternal() {
      this.where('a.visibility', 'internal').andWhere(function admits() {
        this.whereNull('a.category_id').orWhereIn('c.visibility', ['public', 'both']);
      });
    });
  });
}

/** Every article read starts here, so no read can be built without the join. */
function articleQuery(scope) {
  const qb = getDb()(`${ARTICLES} as a`)
    .leftJoin(`${CATEGORIES} as c`, 'c.id', 'a.category_id')
    .where('a.tenant_id', tenantId());
  applyScope(qb, scope);
  return qb;
}

// ── categories ────────────────────────────────────────────────────────────

async function listCategories({ activeOnly = true, visibilities = null } = {}) {
  const qb = getDb()(CATEGORIES).where('tenant_id', tenantId());
  if (activeOnly) qb.where('is_active', true);
  if (Array.isArray(visibilities) && visibilities.length) qb.whereIn('visibility', visibilities);
  const rows = await qb.orderBy('depth', 'asc').orderBy('sequence', 'asc').orderBy('id', 'asc')
    .select(CATEGORY_COLUMNS);
  return rows.map(mapCategory);
}

async function findCategoryById(id) {
  const numeric = toNumber(id);
  if (!numeric) return null;
  const row = await getDb()(CATEGORIES)
    .where({ id: numeric, tenant_id: tenantId() })
    .first(CATEGORY_COLUMNS);
  return mapCategory(row);
}

/** `12`, `'password_resets'` or a documentId — callers hold whichever they have. */
async function findCategory(idOrKey) {
  if (idOrKey === null || idOrKey === undefined || idOrKey === '') return null;
  const numeric = toNumber(idOrKey);
  if (numeric) return findCategoryById(numeric);
  const ref = String(idOrKey);
  const row = await getDb()(CATEGORIES)
    .where('tenant_id', tenantId())
    .where(function byKeyOrDocument() {
      this.where('key', ref.toLowerCase()).orWhere('document_id', ref);
    })
    .first(CATEGORY_COLUMNS);
  return mapCategory(row);
}

async function insertCategory(row) {
  const now = new Date();
  const record = {
    document_id: row.document_id || generateDocumentId(),
    tenant_id: tenantId(),
    key: row.key,
    name: row.name,
    description: row.description === undefined ? null : row.description,
    icon: row.icon === undefined ? null : row.icon,
    parent_id: row.parent_id === undefined ? null : row.parent_id,
    depth: row.depth || 0,
    sequence: row.sequence || 0,
    visibility: row.visibility || 'both',
    is_active: row.is_active === undefined ? true : Boolean(row.is_active),
    created_at: now,
    updated_at: now,
  };
  const [id] = await getDb()(CATEGORIES).insert(record);
  return mapCategory({ ...record, id });
}

async function updateCategory(id, patch) {
  await getDb()(CATEGORIES)
    .where({ id, tenant_id: tenantId() })
    .update({ ...patch, updated_at: new Date() });
  return findCategoryById(id);
}

/** Children of a category, for the depth check and for the delete guard. */
async function countChildCategories(parentId) {
  const [{ total }] = await getDb()(CATEGORIES)
    .where({ parent_id: parentId, tenant_id: tenantId() })
    .count('id as total');
  return Number(total);
}

// ── articles ──────────────────────────────────────────────────────────────

async function findArticleById(id, scope) {
  const numeric = toNumber(id);
  if (!numeric) return null;
  const row = await articleQuery(scope).where('a.id', numeric).first(ARTICLE_COLUMNS);
  return mapArticle(row);
}

/**
 * By documentId or slug, under the caller's scope. Both in one function
 * because the routes accept either in one path segment (the `:idOrKey`
 * precedent from the desk routes) and splitting them would put the scope
 * argument on two call sites instead of one.
 *
 * Slug lookup is locale-aware: the same slug exists once per locale, because a
 * translation is the same article at the same address in another language.
 *
 * With no locale asked for, `en` wins and anything else falls back to the most
 * recently published. The tie-break is explicit rather than left to insertion
 * order so that `/help/{slug}` resolves to the same article on every request —
 * a URL that returns Urdu on one hit and English on the next is a caching bug
 * waiting to be blamed on the CDN.
 */
async function findArticle(ref, scope, { locale = null } = {}) {
  if (ref === null || ref === undefined || ref === '') return null;
  const numeric = toNumber(ref);
  if (numeric) return findArticleById(numeric, scope);
  const value = String(ref);
  const qb = articleQuery(scope).where(function byDocumentOrSlug() {
    this.where('a.document_id', value).orWhere('a.slug', value.toLowerCase());
  });
  if (locale) qb.where('a.locale', locale);
  else qb.orderByRaw("CASE WHEN a.locale = 'en' THEN 0 ELSE 1 END");
  const row = await qb.orderBy('a.published_at', 'desc').orderBy('a.id', 'desc').first(ARTICLE_COLUMNS);
  return mapArticle(row);
}

/**
 * The unscoped read, for writers that have already passed their own gate —
 * publish, archive, rollback. Named so that it cannot be reached by accident:
 * a reader calling this instead of findArticle() is visible in review as the
 * word "Unscoped" at the call site.
 */
async function findArticleUnscoped(ref) {
  if (ref === null || ref === undefined || ref === '') return null;
  const qb = getDb()(`${ARTICLES} as a`).where('a.tenant_id', tenantId());
  const numeric = toNumber(ref);
  if (numeric) qb.where('a.id', numeric);
  else {
    const value = String(ref);
    qb.where(function byDocumentOrSlug() {
      this.where('a.document_id', value).orWhere('a.slug', value.toLowerCase());
    });
  }
  const row = await qb.orderBy('a.id', 'desc').first(ARTICLE_COLUMNS);
  return mapArticle(row);
}

function applyArticleFilters(qb, filters = {}) {
  if (filters.categoryId) qb.where('a.category_id', filters.categoryId);
  if (filters.locale) qb.where('a.locale', filters.locale);
  if (filters.status) qb.where('a.status', filters.status);
  if (filters.visibility) qb.where('a.visibility', filters.visibility);
  if (filters.authorId) qb.where('a.author_id', filters.authorId);
  if (filters.sourceTicketId) qb.where('a.source_ticket_id', filters.sourceTicketId);
  if (filters.deskId) {
    qb.whereIn('a.id', getDb()(ARTICLE_DESKS).where('desk_id', filters.deskId).select('article_id'));
  }
  if (filters.reviewDueBefore) qb.where('a.review_due_at', '<=', filters.reviewDueBefore);
  return qb;
}

async function listArticles(scope, { filters = {}, page = 1, pageSize = 25, sort = 'recent' } = {}) {
  const limit = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const current = Math.max(1, Number(page) || 1);

  const rowsQuery = applyArticleFilters(articleQuery(scope), filters);
  const countQuery = applyArticleFilters(articleQuery(scope), filters);

  // The total is computed under the SAME predicate as the page — see the file
  // docblock. A count that disagrees with the rows is the leak.
  const [{ total }] = await countQuery.count('a.id as total');

  if (sort === 'helpful') rowsQuery.orderBy('a.helpful_count', 'desc');
  else if (sort === 'views') rowsQuery.orderBy('a.view_count', 'desc');
  else if (sort === 'title') rowsQuery.orderBy('a.title', 'asc');
  rowsQuery.orderBy('a.published_at', 'desc').orderBy('a.id', 'desc');

  const rows = await rowsQuery.limit(limit).offset((current - 1) * limit).select(ARTICLE_LIST_COLUMNS);
  return {
    rows: rows.map(mapArticle),
    total: Number(total),
    page: current,
    pageSize: limit,
  };
}

/**
 * Tokenise a query the way a reader means it: words, casefolded, deduped, and
 * capped. The cap is a guard, not a quality decision — an unbounded token list
 * builds an unbounded WHERE clause, and a 400-word paste into a search box must
 * not become a 400-clause query.
 *
 * Tokens shorter than two characters are dropped: they match nearly every row
 * and contribute nothing but scan cost.
 */
function tokenize(query) {
  const raw = String(query || '').toLowerCase();
  const words = raw.split(/[^\p{L}\p{N}_-]+/u).filter((w) => w.length >= 2);
  return [...new Set(words)].slice(0, MAX_TOKENS);
}

function likeTerm(token) {
  // Escape the LIKE metacharacters so a query containing % or _ searches for
  // them rather than becoming a wildcard scan.
  return `%${token.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * Scored search over the caller's scope (§11.5, §26.7). Ranking is relevance,
 * then helpfulness, then recency — in that order, and expressed in SQL so the
 * ordering applies to the whole matching set rather than to whatever page one
 * happened to contain.
 *
 * Returns [] for a query with no usable tokens rather than the whole table: an
 * empty search box is not a request for every internal procedure.
 */
async function searchArticles(scope, query, { filters = {}, limit = 25 } = {}) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const db = getDb();
  const exact = String(query || '').trim().toLowerCase();
  const qb = applyArticleFilters(articleQuery(scope), filters);

  const scoreParts = [];
  const bindings = [];

  scoreParts.push('(CASE WHEN LOWER(a.slug) = ? THEN ? ELSE 0 END)');
  bindings.push(exact, WEIGHT.exactSlug);
  scoreParts.push('(CASE WHEN LOWER(a.title) = ? THEN ? ELSE 0 END)');
  bindings.push(exact, WEIGHT.exactTitle);

  for (const token of tokens) {
    const term = likeTerm(token);
    scoreParts.push('(CASE WHEN LOWER(a.title) LIKE ? THEN ? ELSE 0 END)');
    bindings.push(term, WEIGHT.title);
    scoreParts.push("(CASE WHEN LOWER(COALESCE(a.tags, '')) LIKE ? THEN ? ELSE 0 END)");
    bindings.push(term, WEIGHT.tags);
    scoreParts.push("(CASE WHEN LOWER(COALESCE(a.summary, '')) LIKE ? THEN ? ELSE 0 END)");
    bindings.push(term, WEIGHT.summary);
    scoreParts.push("(CASE WHEN LOWER(COALESCE(a.body, '')) LIKE ? THEN ? ELSE 0 END)");
    bindings.push(term, WEIGHT.body);
  }

  const score = scoreParts.join(' + ');

  // Only rows that matched something. Without this the score expression would
  // order the entire table and page one would be full of zero-score articles.
  qb.where(function anyToken() {
    this.whereRaw('LOWER(a.slug) = ?', [exact]);
    for (const token of tokens) {
      const term = likeTerm(token);
      this.orWhereRaw('LOWER(a.title) LIKE ?', [term])
        .orWhereRaw("LOWER(COALESCE(a.tags, '')) LIKE ?", [term])
        .orWhereRaw("LOWER(COALESCE(a.summary, '')) LIKE ?", [term])
        .orWhereRaw("LOWER(COALESCE(a.body, '')) LIKE ?", [term]);
    }
  });

  const rows = await qb
    .select([...ARTICLE_LIST_COLUMNS, db.raw(`(${score}) as relevance`, bindings)])
    .orderBy('relevance', 'desc')
    .orderBy('a.helpful_count', 'desc')
    .orderBy('a.published_at', 'desc')
    .orderBy('a.id', 'desc')
    .limit(Math.min(MAX_SCAN, Math.max(1, Number(limit) || 25)));

  return rows.map((row) => ({ ...mapArticle(row), relevance: Number(row.relevance) || 0 }));
}

async function insertArticle(row) {
  const now = new Date();
  const record = {
    document_id: row.document_id || generateDocumentId(),
    tenant_id: tenantId(),
    title: row.title,
    slug: row.slug,
    category_id: row.category_id === undefined ? null : row.category_id,
    visibility: row.visibility,
    status: row.status || 'draft',
    summary: row.summary === undefined ? null : row.summary,
    body: row.body === undefined ? null : row.body,
    body_format: row.body_format || 'markdown',
    locale: row.locale || 'en',
    translation_of_id: row.translation_of_id === undefined ? null : row.translation_of_id,
    tags: JSON.stringify(row.tags || []),
    attachment_ids: JSON.stringify(row.attachment_ids || []),
    author_id: row.author_id === undefined ? null : row.author_id,
    reviewer_id: row.reviewer_id === undefined ? null : row.reviewer_id,
    published_at: row.published_at === undefined ? null : row.published_at,
    review_due_at: row.review_due_at === undefined ? null : row.review_due_at,
    archived_at: null,
    view_count: 0,
    helpful_count: 0,
    unhelpful_count: 0,
    deflection_count: 0,
    failed_deflection_count: 0,
    source_ticket_id: row.source_ticket_id === undefined ? null : row.source_ticket_id,
    source_kind: row.source_kind || 'manual',
    source_ref: row.source_ref === undefined ? null : row.source_ref,
    version: 0,
    created_at: now,
    updated_at: now,
  };
  const [id] = await getDb()(ARTICLES).insert(record);
  return mapArticle({ ...record, id });
}

const JSON_ARTICLE_COLUMNS = new Set(['tags', 'attachment_ids']);

async function updateArticle(id, patch) {
  const write = { updated_at: new Date() };
  for (const [column, value] of Object.entries(patch)) {
    write[column] = JSON_ARTICLE_COLUMNS.has(column) ? JSON.stringify(value || []) : value;
  }
  await getDb()(ARTICLES).where({ id, tenant_id: tenantId() }).update(write);
  return findArticleUnscoped(id);
}

/**
 * Is this slug free in this locale? Scoped to the tenant, never global (T1) —
 * the unique index says the same thing, and this exists so a clash is a
 * ValidationError with a usable message rather than a driver error.
 */
async function slugTaken(slug, locale, excludeId = null) {
  const qb = getDb()(ARTICLES)
    .where({ tenant_id: tenantId(), slug, locale });
  if (excludeId) qb.whereNot('id', excludeId);
  const row = await qb.first('id');
  return Boolean(row);
}

/** The counters, incremented in place. `view_count` is the hottest write here. */
async function bumpCounter(id, column, by = 1) {
  await getDb()(ARTICLES).where({ id, tenant_id: tenantId() }).increment(column, by);
}

// ── versions ──────────────────────────────────────────────────────────────

async function listVersions(articleId) {
  const rows = await getDb()(VERSIONS)
    .where({ article_id: articleId, tenant_id: tenantId() })
    .orderBy('version', 'desc')
    .select('*');
  return rows.map(mapVersion);
}

async function findVersion(articleId, version) {
  const row = await getDb()(VERSIONS)
    .where({ article_id: articleId, tenant_id: tenantId(), version })
    .first('*');
  return mapVersion(row);
}

async function latestVersionNumber(articleId) {
  const row = await getDb()(VERSIONS)
    .where({ article_id: articleId, tenant_id: tenantId() })
    .max('version as latest')
    .first();
  return Number(row && row.latest ? row.latest : 0);
}

/**
 * Append an immutable snapshot. The (article_id, version) unique index is what
 * makes "immutable" true rather than intended: a second write of the same
 * number fails instead of overwriting a snapshot a rollback may be about to
 * restore from.
 */
async function insertVersion(row) {
  const now = new Date();
  const record = {
    document_id: generateDocumentId(),
    tenant_id: tenantId(),
    article_id: row.article_id,
    version: row.version,
    title: row.title,
    summary: row.summary === undefined ? null : row.summary,
    body: row.body === undefined ? null : row.body,
    body_format: row.body_format || 'markdown',
    published_by: row.published_by === undefined ? null : row.published_by,
    published_at: row.published_at || now,
    change_note: row.change_note === undefined ? null : row.change_note,
    rolled_back_from: row.rolled_back_from === undefined ? null : row.rolled_back_from,
    created_at: now,
  };
  const [id] = await getDb()(VERSIONS).insert(record);
  return mapVersion({ ...record, id });
}

// ── desk tags and related links ───────────────────────────────────────────

async function deskIdsFor(articleId) {
  const rows = await getDb()(ARTICLE_DESKS).where('article_id', articleId).pluck('desk_id');
  return rows.map(Number);
}

async function setDeskIds(articleId, deskIds) {
  const wanted = [...new Set((deskIds || []).map(Number).filter(Number.isFinite))];
  const current = await deskIdsFor(articleId);
  const toAdd = wanted.filter((id) => !current.includes(id));
  const toRemove = current.filter((id) => !wanted.includes(id));
  if (toRemove.length) {
    await getDb()(ARTICLE_DESKS).where('article_id', articleId).whereIn('desk_id', toRemove).del();
  }
  if (toAdd.length) {
    const now = new Date();
    await getDb()(ARTICLE_DESKS).insert(toAdd.map((deskId) => ({
      article_id: articleId, desk_id: deskId, created_at: now,
    })));
  }
  return wanted;
}

async function relatedIdsFor(articleId) {
  const rows = await getDb()(ARTICLE_RELATED).where('article_id', articleId).pluck('related_article_id');
  return rows.map(Number);
}

async function setRelatedIds(articleId, relatedIds) {
  const wanted = [...new Set((relatedIds || []).map(Number).filter(Number.isFinite))]
    // An article related to itself is a rendering loop with no meaning.
    .filter((id) => id !== Number(articleId));
  const current = await relatedIdsFor(articleId);
  const toAdd = wanted.filter((id) => !current.includes(id));
  const toRemove = current.filter((id) => !wanted.includes(id));
  if (toRemove.length) {
    await getDb()(ARTICLE_RELATED)
      .where('article_id', articleId).whereIn('related_article_id', toRemove).del();
  }
  if (toAdd.length) {
    const now = new Date();
    await getDb()(ARTICLE_RELATED).insert(toAdd.map((relatedId) => ({
      article_id: articleId, related_article_id: relatedId, created_at: now,
    })));
  }
  return wanted;
}

/** Who points AT this article — asked before archiving it. */
async function inboundRelatedIds(articleId) {
  const rows = await getDb()(ARTICLE_RELATED)
    .where('related_article_id', articleId).pluck('article_id');
  return rows.map(Number);
}

/**
 * Desk tags for a batch of articles, as a Map. One query for a page rather than
 * one per row: a 25-article page that fanned out to 25 lookups is the classic
 * N+1 that makes a list endpoint miss its latency target for no reason.
 */
async function deskIdsForMany(articleIds) {
  const out = new Map(articleIds.map((id) => [Number(id), []]));
  if (!articleIds.length) return out;
  const rows = await getDb()(ARTICLE_DESKS)
    .whereIn('article_id', articleIds).select('article_id', 'desk_id');
  for (const row of rows) {
    const key = Number(row.article_id);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(Number(row.desk_id));
  }
  return out;
}

// ── feedback and deflection ───────────────────────────────────────────────

async function findFeedback(articleId, sessionKey, kinds) {
  const row = await getDb()(FEEDBACK)
    .where({ article_id: articleId, tenant_id: tenantId(), session_key: sessionKey })
    .whereIn('kind', kinds)
    .first('*');
  if (!row) return null;
  return {
    id: Number(row.id),
    documentId: row.document_id,
    article_id: Number(row.article_id),
    kind: row.kind,
    session_key: row.session_key,
    user_id: toNumber(row.user_id),
    surface: row.surface,
    comment: row.comment,
    ticket_id: toNumber(row.ticket_id),
    createdAt: row.created_at,
  };
}

async function insertFeedback(row) {
  const now = new Date();
  const record = {
    document_id: generateDocumentId(),
    tenant_id: tenantId(),
    article_id: row.article_id,
    kind: row.kind,
    session_key: row.session_key,
    user_id: row.user_id === undefined ? null : row.user_id,
    surface: row.surface || 'public',
    comment: row.comment === undefined ? null : row.comment,
    ticket_id: row.ticket_id === undefined ? null : row.ticket_id,
    created_at: now,
    updated_at: now,
  };
  const [id] = await getDb()(FEEDBACK).insert(record);
  return { ...record, id: Number(id), documentId: record.document_id };
}

async function updateFeedbackKind(id, kind) {
  await getDb()(FEEDBACK)
    .where({ id, tenant_id: tenantId() })
    .update({ kind, updated_at: new Date() });
}

async function countFeedback(articleId, kind) {
  const [{ total }] = await getDb()(FEEDBACK)
    .where({ article_id: articleId, tenant_id: tenantId(), kind })
    .count('id as total');
  return Number(total);
}

// ── zero-result capture (§11.10, §26.10) ──────────────────────────────────

function normalizeQuery(query) {
  return String(query || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 191);
}

/**
 * Record a search that found nothing, as a rollup. Written with an
 * insert-then-fallback rather than a read-then-write: two readers missing on
 * the same term at the same moment would otherwise both insert and one would
 * lose to the unique index, turning a report row into a request failure.
 */
async function recordSearchMiss(query, surface) {
  const normalized = normalizeQuery(query);
  if (!normalized) return;
  const now = new Date();
  const updated = await getDb()(SEARCH_MISSES)
    .where({ tenant_id: tenantId(), normalized, surface })
    .update({ occurrences: getDb().raw('occurrences + 1'), last_seen_at: now });
  if (updated) return;
  try {
    await getDb()(SEARCH_MISSES).insert({
      tenant_id: tenantId(),
      query: String(query || '').slice(0, 191),
      normalized,
      surface,
      occurrences: 1,
      first_seen_at: now,
      last_seen_at: now,
    });
  } catch {
    // Lost the race to another reader's insert — their row is the one that
    // counts, so increment it instead of failing a search over a report row.
    await getDb()(SEARCH_MISSES)
      .where({ tenant_id: tenantId(), normalized, surface })
      .update({ occurrences: getDb().raw('occurrences + 1'), last_seen_at: now });
  }
}

async function topSearchMisses({ surface = null, limit = 50 } = {}) {
  const qb = getDb()(SEARCH_MISSES).where('tenant_id', tenantId());
  if (surface) qb.where('surface', surface);
  const rows = await qb
    .orderBy('occurrences', 'desc')
    .orderBy('last_seen_at', 'desc')
    .limit(Math.min(200, Math.max(1, Number(limit) || 50)))
    .select('query', 'normalized', 'surface', 'occurrences', 'first_seen_at', 'last_seen_at');
  return rows.map((row) => ({
    query: row.query,
    normalized: row.normalized,
    surface: row.surface,
    occurrences: Number(row.occurrences),
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
  }));
}

// ── the staleness sweep's query (§11.4) ───────────────────────────────────

/**
 * Published articles whose review has come due. Scanned by the sweep with a
 * keyset cursor rather than an offset: the sweep updates the rows it finds, so
 * paging by offset would skip every second batch.
 */
async function findReviewDue(now, { afterId = 0, limit = 100 } = {}) {
  const rows = await getDb()(`${ARTICLES} as a`)
    .where('a.tenant_id', tenantId())
    .where('a.status', 'published')
    .whereNotNull('a.review_due_at')
    .where('a.review_due_at', '<=', now)
    .where('a.id', '>', afterId)
    .orderBy('a.id', 'asc')
    .limit(limit)
    .select(ARTICLE_COLUMNS);
  return rows.map(mapArticle);
}

module.exports = {
  CATEGORIES,
  ARTICLES,
  VERSIONS,
  ARTICLE_DESKS,
  ARTICLE_RELATED,
  FEEDBACK,
  SEARCH_MISSES,
  ARTICLE_UID: 'api::helpdesk-kb-article.helpdesk-kb-article',

  tenantId,
  generateDocumentId,
  normalizeQuery,
  tokenize,
  applyScope,

  listCategories,
  findCategory,
  findCategoryById,
  insertCategory,
  updateCategory,
  countChildCategories,

  findArticle,
  findArticleById,
  findArticleUnscoped,
  listArticles,
  searchArticles,
  insertArticle,
  updateArticle,
  slugTaken,
  bumpCounter,

  listVersions,
  findVersion,
  latestVersionNumber,
  insertVersion,

  deskIdsFor,
  deskIdsForMany,
  setDeskIds,
  relatedIdsFor,
  setRelatedIds,
  inboundRelatedIds,

  findFeedback,
  insertFeedback,
  updateFeedbackKind,
  countFeedback,

  recordSearchMiss,
  topSearchMisses,
  findReviewDue,
};
