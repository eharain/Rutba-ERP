'use strict';

/**
 * KbArticleService — authoring, lifecycle, versioning, search and the
 * deflection measurement (spec 11).
 *
 * The KB's job, in the spec's order of value: deflection first (the requester
 * finds the answer and never raises a ticket), agent speed second, AI grounding
 * third. Everything here serves the first one — which is why the measurement
 * half is not an afterthought at the bottom of the file but the reason the
 * counters and the ledger exist at all.
 *
 * ONE GATE, AND IT IS NOT IN THIS FILE. Every read runs through a `scope` from
 * policy/kb-visibility.js that the repository pushes into SQL; every write runs
 * through kb.assertCan. No function here decides visibility by inspecting an
 * article — that decision has exactly one home, and a service that second-
 * guessed it would be the second home.
 *
 * THE ACCEPTANCE CRITERION THIS FILE IS MEASURED BY (§11): an `agent_only`
 * article never appears in requester search, in suggestions, in the portal, on
 * the public pages, or in an AI answer. Note how that is achieved — not by a
 * check in each of those five paths, but by all five obtaining their rows from
 * two functions (`find` and `suggest`) that cannot construct a query without a
 * scope. There is no code path to an article row that skips it.
 *
 * ROLLBACK CREATES A NEW VERSION AND NEVER MUTATES HISTORY (§11.4). A version
 * row is a published snapshot somebody may have quoted, linked or exported; a
 * rollback that edited one would rewrite the past to look like the present.
 * The restored content therefore arrives as version N+1 carrying
 * `rolled_back_from`, and the (article_id, version) unique index makes the
 * "never mutates" half structural rather than intended.
 *
 * PUBLISHING IS A HUMAN ACT. `kb.publish` is manager/admin (§11.4) because a
 * published article is a public statement by the business, and no machine actor
 * holds the capability at all — the same reasoning RULE-9 applies to resolving
 * a ticket. The staleness sweep can flag an article; it cannot publish or
 * unpublish one on its own initiative unless a human turned that on.
 *
 * Env knobs:
 *   RUTBA_CORE_HELPDESK_KB_REVIEW_RULE       staleness cron rule   daily 04:17
 *   RUTBA_CORE_HELPDESK_KB_REVIEW_BATCH      articles per batch            100
 *   RUTBA_CORE_HELPDESK_KB_REVIEW_MAX_BATCHES batches per pass              50
 *   RUTBA_CORE_HELPDESK_KB_REVIEW_GRACE_DAYS re-nag interval                 7
 *   RUTBA_CORE_HELPDESK_KB_REVIEW_UNPUBLISH  '1' pulls stale articles      off
 *   RUTBA_CORE_HELPDESK_KB_SUGGEST_LIMIT     suggestions returned            5
 */

const crypto = require('crypto');
const { withTransaction } = require('../../db/connection');
const { emit } = require('../../platform/events');
const { registerCron } = require('../../platform/cron');
const { get } = require('../../config/env');
const kbRepo = require('./repository/kb.repo');
const kb = require('./policy/kb-visibility');
const { eventActor } = require('./policy/entitlement');
const categoryService = require('./kb-category.service');

const ARTICLE_UID = kbRepo.ARTICLE_UID;
const SWEEP_CRON = 'helpdeskKbReviewSweep';

const LOCALES = Object.freeze(['en', 'ur']);
const FEEDBACK_KINDS = Object.freeze(['helpful', 'unhelpful']);
const DEFLECTION_KINDS = Object.freeze(['deflected', 'failed_deflection']);

const MAX_TITLE = 255;
const MAX_SUMMARY = 2000;
const MAX_BODY = 200000;
const MAX_TAGS = 25;
const MAX_COMMENT = 1000;

/** Fields a client may write. `status`, the counters and `version` are absent
 *  on purpose: status moves only through the named lifecycle actions (the same
 *  rule RULE-4 states for tickets), and a counter a client can set is not a
 *  measurement. */
const WRITABLE = Object.freeze([
  'title', 'slug', 'category_id', 'category', 'visibility', 'summary', 'body', 'body_format',
  'locale', 'translation_of_id', 'tags', 'attachment_ids', 'review_due_at',
  'desk_ids', 'related_article_ids', 'reviewer_id',
]);

class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    if (details) this.details = details;
  }
}

const NotFoundError = kb.NotFoundError;

function intEnv(name, fallback) {
  const raw = parseInt(get(name, ''), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function warn(message) {
  const log = global.strapi && global.strapi.log;
  if (log && typeof log.warn === 'function') log.warn(message);
  else console.warn(message);
}

// ── input shaping ─────────────────────────────────────────────────────────

/**
 * A readable, stable URL segment. Stability is the point (§11.3): the slug is
 * what `/help/{slug}` and every link anyone has shared is built from, so it is
 * derived from the title ONCE at creation and never re-derived on edit. An
 * author who genuinely wants a new address supplies one.
 */
function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'article';
}

function bounded(value, max, field) {
  if (value === null || value === undefined) return null;
  const str = String(value);
  if (str.length > max) throw new ValidationError(`${field} exceeds ${max} characters`);
  return str;
}

function normalizeTags(value) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError('tags must be an array');
  const tags = [...new Set(value.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))];
  if (tags.length > MAX_TAGS) throw new ValidationError(`an article carries at most ${MAX_TAGS} tags`);
  return tags;
}

function normalizeIds(value, field) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be an array`);
  return [...new Set(value.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
}

function parseDate(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${field} is not a valid date`);
  return date;
}

/**
 * Shape checks only. The cross-row checks — slug uniqueness, category
 * existence, desk existence — need the database and run separately, so that a
 * malformed payload is refused without touching it.
 */
async function normalizeInput(patch, current) {
  const out = {};
  for (const field of WRITABLE) {
    // `undefined` is "not supplied", not "set to undefined". A caller that
    // forwards an optional argument through — draftFromTicket does exactly
    // that with `visibility` — otherwise builds a key whose value then fails
    // its own enum check, and the caller is told their payload is invalid when
    // they never sent the field. `null` remains the explicit clear.
    if (patch[field] === undefined) continue;
    out[field] = patch[field];
  }

  if ('title' in out) {
    out.title = bounded(String(out.title || '').trim(), MAX_TITLE, 'title');
    if (!out.title) throw new ValidationError('title is required');
  }
  if ('summary' in out) out.summary = bounded(out.summary, MAX_SUMMARY, 'summary');
  if ('body' in out) out.body = bounded(out.body, MAX_BODY, 'body');
  if ('body_format' in out) {
    const format = String(out.body_format || '').trim().toLowerCase();
    if (!['text', 'html', 'markdown'].includes(format)) {
      throw new ValidationError('body_format must be text, html or markdown');
    }
    out.body_format = format;
  }
  if ('visibility' in out && !kb.TIERS.includes(out.visibility)) {
    throw new ValidationError(
      `visibility must be one of ${kb.TIERS.join(', ')}`, { visibility: out.visibility }
    );
  }
  if ('locale' in out) {
    const locale = String(out.locale || '').trim().toLowerCase();
    if (!LOCALES.includes(locale)) {
      throw new ValidationError(`locale must be one of ${LOCALES.join(', ')}`, { locale: out.locale });
    }
    out.locale = locale;
  }
  if ('tags' in out) out.tags = normalizeTags(out.tags);
  if ('attachment_ids' in out) out.attachment_ids = normalizeIds(out.attachment_ids, 'attachment_ids');
  if ('desk_ids' in out) out.desk_ids = normalizeIds(out.desk_ids, 'desk_ids');
  if ('related_article_ids' in out) {
    out.related_article_ids = normalizeIds(out.related_article_ids, 'related_article_ids');
  }
  if ('review_due_at' in out) out.review_due_at = parseDate(out.review_due_at, 'review_due_at');
  if ('slug' in out) {
    const slug = slugify(out.slug);
    if (!slug) throw new ValidationError('slug cannot be empty');
    out.slug = slug;
  }
  for (const field of ['translation_of_id', 'reviewer_id']) {
    if (!(field in out)) continue;
    out[field] = out[field] === null || out[field] === '' ? null : Number(out[field]);
    if (out[field] !== null && !Number.isFinite(out[field])) {
      throw new ValidationError(`${field} must be an id or null`);
    }
  }

  // `category` accepts a key or documentId, `category_id` an id — clients hold
  // whichever they have, and the resolution happens once, here.
  if ('category' in out) {
    const ref = out.category;
    delete out.category;
    if (ref === null || ref === '') out.category_id = null;
    else {
      const category = await categoryService.requireCategory(ref);
      out.category_id = category.id;
    }
  } else if ('category_id' in out) {
    if (out.category_id === null || out.category_id === '') out.category_id = null;
    else {
      const category = await categoryService.requireCategory(out.category_id);
      out.category_id = category.id;
    }
  }

  if (current && 'locale' in out && out.locale !== current.locale && !('slug' in out)) {
    // Moving locale changes which uniqueness bucket the slug lives in; make the
    // author say what the address should be rather than guessing.
    throw new ValidationError('changing locale requires an explicit slug');
  }
  return out;
}

// ── hydration ─────────────────────────────────────────────────────────────

/**
 * An article as the API returns it: the row, plus its desk tags and related
 * ids, plus a `category` block when it has one. The body is dropped from LIST
 * responses — a page of 25 full articles is megabytes for a result list nobody
 * reads in full, and the summary is what §11.3 says search results show.
 */
async function hydrate(article, { withBody = true, deskIds = null } = {}) {
  if (!article) return null;
  const out = { ...article };
  out.desk_ids = deskIds === null ? await kbRepo.deskIdsFor(article.id) : deskIds;
  if (withBody) {
    out.related_article_ids = await kbRepo.relatedIdsFor(article.id);
  } else {
    delete out.body;
  }
  if (article.category_id) {
    const category = await kbRepo.findCategoryById(article.category_id);
    out.category = category
      ? { id: category.id, documentId: category.documentId, key: category.key, name: category.name }
      : null;
  } else {
    out.category = null;
  }
  return out;
}

/** A page of articles, hydrated with ONE desk-tag query rather than N. */
async function hydrateMany(articles) {
  const tags = await kbRepo.deskIdsForMany(articles.map((a) => a.id));
  return Promise.all(articles.map((a) => hydrate(a, { withBody: false, deskIds: tags.get(a.id) || [] })));
}

// ── reads ─────────────────────────────────────────────────────────────────

function scopeFor(actor, options = {}) {
  return kb.readScope(actor, { includeArchived: options.includeArchived === true });
}

/**
 * List or search, visibility-filtered (§11.7 `GET /kb/articles`). `q` switches
 * it from a filtered list to a ranked search; both run under the same scope, so
 * neither can reach a tier the other could not.
 *
 * A search that finds nothing is RECORDED (§11.10, §26.10). Zero-result queries
 * are the KB's backlog — the list of things people are looking for and not
 * finding is the most actionable content roadmap available — and capturing them
 * is a write on the read path that is worth its cost exactly once per miss.
 */
async function find(actor, options = {}) {
  const scope = scopeFor(actor, options);
  const filters = {
    categoryId: options.categoryId ? Number(options.categoryId) : null,
    locale: options.locale || null,
    status: options.status || null,
    visibility: options.visibility || null,
    deskId: options.deskId ? Number(options.deskId) : null,
    authorId: options.authorId ? Number(options.authorId) : null,
  };

  // A caller asking for a tier or status they may not see gets nothing rather
  // than everything: the filter narrows the scope, it never widens it.
  if (filters.visibility && !scope.tiers.includes(filters.visibility)) {
    return { data: [], meta: { pagination: { page: 1, pageSize: 25, total: 0, pageCount: 0 } } };
  }
  if (filters.status && !scope.statuses.includes(filters.status)) {
    return { data: [], meta: { pagination: { page: 1, pageSize: 25, total: 0, pageCount: 0 } } };
  }

  const query = String(options.q || '').trim();
  if (query) {
    // A search returns ONE ranked page, and `total` is the size of that page
    // rather than the size of the whole matching set. That is a real
    // limitation and it is reported honestly instead of being papered over
    // with a second COUNT that would have to re-run the scoring: paging
    // through ranked results wants the keyset cursor §26.8 specifies, which
    // belongs to the search slice along with the full-text index. A caller
    // that gets `pageSize` rows back should assume there may be more.
    const limit = Math.min(100, Math.max(1, Number(options.pageSize) || 25));
    const rows = await kbRepo.searchArticles(scope, query, { filters, limit });
    if (!rows.length) await recordMiss(actor, query);
    return {
      data: await hydrateMany(rows),
      meta: {
        pagination: { page: 1, pageSize: limit, total: rows.length, pageCount: 1 },
        query,
        truncated: rows.length === limit,
      },
    };
  }

  const page = await kbRepo.listArticles(scope, {
    filters,
    page: options.page,
    pageSize: options.pageSize,
    sort: options.sort,
  });
  return {
    data: await hydrateMany(page.rows),
    meta: {
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
        pageCount: Math.ceil(page.total / page.pageSize) || 0,
      },
    },
  };
}

async function recordMiss(actor, query) {
  try {
    await kbRepo.recordSearchMiss(query, kb.surfaceFor(actor));
  } catch (err) {
    // A report row must never fail a search. Nothing is swallowed silently.
    warn(`[helpdesk.kb] could not record zero-result query "${query}": ${err.message}`);
  }
}

/**
 * One article by documentId or slug. 404 — never 403 — when the caller may not
 * see it: a 403 confirms it exists, which turns the slug space into an
 * enumeration oracle over internal procedure titles, and "how to process a
 * chargeback" leaks something merely by being guessed correctly (spec 27.8).
 */
async function findOne(actor, ref, options = {}) {
  const scope = scopeFor(actor, options);
  const article = await kbRepo.findArticle(ref, scope, { locale: options.locale || null });
  if (!article) throw new NotFoundError('Not Found');
  if (options.countView !== false) {
    try {
      await kbRepo.bumpCounter(article.id, 'view_count');
      article.view_count += 1;
    } catch (err) {
      warn(`[helpdesk.kb] could not count a view on ${article.documentId}: ${err.message}`);
    }
  }
  return hydrate(article);
}

/**
 * Suggestions — deflection at the point of intent (§11.5). Called while a
 * requester is composing a ticket and from the agent's ticket detail, which is
 * why it takes either a free-text query or a ticket to match against.
 *
 * Published only, whatever the caller's other rights: a suggestion is an answer
 * offered to somebody, and offering a draft is offering something nobody has
 * vouched for.
 */
async function suggest(actor, options = {}) {
  const limit = Math.min(20, Math.max(1, Number(options.limit)
    || intEnv('RUTBA_CORE_HELPDESK_KB_SUGGEST_LIMIT', 5)));

  let query = String(options.q || '').trim();
  let deskId = options.deskId ? Number(options.deskId) : null;

  if (options.ticketId) {
    // Read the ticket through TicketService so the caller's entitlement decides
    // whether they may see it — a suggestion endpoint must not become a way to
    // read the subject line of somebody else's ticket. Required lazily: the
    // helpdesk module wires both services and a top-level require would make
    // the pair cyclic once TicketService starts suggesting articles.
    const ticketService = require('./ticket.service');
    const ticket = await ticketService.findOne(actor, options.ticketId);
    query = [query, ticket.subject, ticket.message].filter(Boolean).join(' ').trim();
    if (!deskId && ticket.desk_id) deskId = ticket.desk_id;
  }

  if (!query) return [];

  const scope = {
    ...kb.readScope(actor),
    statuses: ['published'],
  };

  // Desk-tagged articles first, then the rest of the tenant's KB. A desk tag is
  // a statement that this article is relevant HERE (§11.2), and an article
  // written for the IT desk should outrank a general one on an IT ticket — but
  // the fallback is deliberate, because the KB is tenant-scoped and a desk with
  // no tagged articles must still get suggestions.
  const tagged = deskId
    ? await kbRepo.searchArticles(scope, query, { filters: { deskId }, limit })
    : [];
  const seen = new Set(tagged.map((row) => row.id));
  const rest = tagged.length >= limit
    ? []
    : (await kbRepo.searchArticles(scope, query, { limit: limit * 2 }))
      .filter((row) => !seen.has(row.id));

  const rows = [...tagged, ...rest].slice(0, limit);
  if (!rows.length) await recordMiss(actor, query);
  return hydrateMany(rows);
}

async function versions(actor, ref) {
  kb.assertCan(actor, 'kb.author');
  const article = await requireVisible(actor, ref);
  return kbRepo.listVersions(article.id);
}

// ── writes ────────────────────────────────────────────────────────────────

/**
 * The article a WRITER is acting on. Loaded under the writer's own read scope
 * so an author cannot act on a tier they cannot read, and 404 rather than 403
 * for the same reason findOne is.
 */
async function requireVisible(actor, ref) {
  const article = await kbRepo.findArticle(ref, kb.readScope(actor, { includeArchived: true }));
  if (!article) throw new NotFoundError('Not Found');
  return article;
}

async function assertSlugFree(slug, locale, excludeId) {
  if (await kbRepo.slugTaken(slug, locale, excludeId)) {
    throw new ValidationError(
      `slug "${slug}" is already used by another ${locale} article`, { slug, locale }
    );
  }
}

/**
 * A new draft. Never born published, whatever the payload says — publishing is
 * a separate act with a separate permission (§11.4), and a create that could
 * publish would be that permission with a different name.
 */
async function create(actor, input = {}) {
  kb.assertCan(actor, 'kb.author');

  const patch = await normalizeInput(input, null);
  if (!patch.title) throw new ValidationError('title is required');

  const locale = patch.locale || 'en';
  const slug = patch.slug || slugify(patch.title);
  await assertSlugFree(slug, locale, null);

  const row = {
    title: patch.title,
    slug,
    locale,
    category_id: patch.category_id === undefined ? null : patch.category_id,
    // Defaults to the most restrictive tier — see migration 018. An article
    // whose author never said who it was for must not be the one that reaches
    // a customer.
    visibility: patch.visibility || 'agent_only',
    status: 'draft',
    summary: patch.summary === undefined ? null : patch.summary,
    body: patch.body === undefined ? null : patch.body,
    body_format: patch.body_format || 'markdown',
    translation_of_id: patch.translation_of_id === undefined ? null : patch.translation_of_id,
    tags: patch.tags || [],
    attachment_ids: patch.attachment_ids || [],
    author_id: actor && actor.id ? actor.id : null,
    reviewer_id: patch.reviewer_id === undefined ? null : patch.reviewer_id,
    review_due_at: patch.review_due_at === undefined ? null : patch.review_due_at,
    source_ticket_id: input.source_ticket_id === undefined ? null : input.source_ticket_id,
    source_kind: input.source_kind || 'manual',
    source_ref: input.source_ref === undefined ? null : input.source_ref,
  };

  const created = await withTransaction(async () => {
    const article = await kbRepo.insertArticle(row);
    if (patch.desk_ids) await kbRepo.setDeskIds(article.id, patch.desk_ids);
    if (patch.related_article_ids) await kbRepo.setRelatedIds(article.id, patch.related_article_ids);
    await emit({
      eventName: 'helpdesk.kb.article.created',
      entityUid: ARTICLE_UID,
      documentId: article.documentId,
      tenantId: kbRepo.tenantId(),
      actor: eventActor(actor),
      payload: {
        articleId: article.id, slug: article.slug, title: article.title,
        visibility: article.visibility, locale: article.locale,
        sourceTicketId: article.source_ticket_id,
      },
    });
    return article;
  });

  return hydrate(created);
}

/**
 * Partial update of the DRAFT content. A published article can be edited too —
 * the edit is not live until the next publish, because what a reader sees is
 * the article row and publish is what stamps it. That is a deliberate
 * simplification of §11.3's "published version" wording and it is worth being
 * explicit about: this model keeps ONE editable row plus an append-only version
 * history, rather than a separate draft row shadowing every published article.
 * The trade is that an edit to a published article is visible immediately; the
 * gain is that there is one row to be right about, and no draft/published pair
 * that can silently diverge.
 */
async function update(actor, ref, input = {}) {
  kb.assertCan(actor, 'kb.author');
  const current = await requireVisible(actor, ref);
  if (current.status === 'archived') {
    throw new ValidationError('an archived article cannot be edited — restore it first');
  }

  const patch = await normalizeInput(input, current);
  const write = {};
  for (const field of ['title', 'category_id', 'visibility', 'summary', 'body', 'body_format',
    'locale', 'translation_of_id', 'tags', 'attachment_ids', 'review_due_at', 'reviewer_id']) {
    if (field in patch) write[field] = patch[field];
  }
  if ('slug' in patch && patch.slug !== current.slug) write.slug = patch.slug;

  if (write.slug || write.locale) {
    await assertSlugFree(write.slug || current.slug, write.locale || current.locale, current.id);
  }

  const updated = await withTransaction(async () => {
    const article = Object.keys(write).length
      ? await kbRepo.updateArticle(current.id, write)
      : current;
    if ('desk_ids' in patch) await kbRepo.setDeskIds(current.id, patch.desk_ids);
    if ('related_article_ids' in patch) await kbRepo.setRelatedIds(current.id, patch.related_article_ids);
    return article;
  });

  return hydrate(updated);
}

/** draft → in_review (§11.4). */
async function submitReview(actor, ref, input = {}) {
  kb.assertCan(actor, 'kb.author');
  const article = await requireVisible(actor, ref);
  if (article.status !== 'draft') {
    throw new ValidationError(
      `only a draft can be submitted for review — this article is ${article.status}`,
      { status: article.status }
    );
  }
  if (!article.body || !String(article.body).trim()) {
    throw new ValidationError('an article with no body cannot be reviewed');
  }

  const write = { status: 'in_review' };
  if (input.reviewer_id !== undefined) {
    write.reviewer_id = input.reviewer_id === null ? null : Number(input.reviewer_id);
  }

  const updated = await withTransaction(async () => {
    const row = await kbRepo.updateArticle(article.id, write);
    await emit({
      eventName: 'helpdesk.kb.article.submitted_for_review',
      entityUid: ARTICLE_UID,
      documentId: article.documentId,
      tenantId: kbRepo.tenantId(),
      actor: eventActor(actor),
      payload: {
        articleId: article.id, slug: article.slug, title: article.title,
        reviewerId: row.reviewer_id, note: input.note || null,
      },
    });
    return row;
  });
  return hydrate(updated);
}

/** in_review → draft, the rejection arm of §11.4's flow. */
async function reject(actor, ref, input = {}) {
  kb.assertCan(actor, 'kb.review');
  const article = await requireVisible(actor, ref);
  if (article.status !== 'in_review') {
    throw new ValidationError(
      `only an article in review can be rejected — this one is ${article.status}`,
      { status: article.status }
    );
  }
  const reason = String(input.reason || '').trim();
  // A rejection with no reason is a dead end for the author: they know it came
  // back and not what to change.
  if (!reason) throw new ValidationError('a rejection needs a reason');

  const updated = await withTransaction(async () => {
    const row = await kbRepo.updateArticle(article.id, { status: 'draft' });
    await emit({
      eventName: 'helpdesk.kb.article.rejected',
      entityUid: ARTICLE_UID,
      documentId: article.documentId,
      tenantId: kbRepo.tenantId(),
      actor: eventActor(actor),
      payload: { articleId: article.id, slug: article.slug, reason },
    });
    return row;
  });
  return hydrate(updated);
}

/**
 * Publish, and snapshot (§11.4).
 *
 * Accepts `draft` as well as `in_review`: the control §11.4 asks for is the
 * PERMISSION, and a manager who holds both `kb.review` and `kb.publish`
 * submitting an article to themselves is ceremony, not review.
 *
 * It also accepts `published`, and that is the case worth being explicit about.
 * Re-publishing an edited article is HOW version 2 comes to exist — the version
 * history is a record of publishes, so a model that refused to publish a
 * published article could only ever hold one version per article and §11.4's
 * rollback would have nothing to roll back to. An archived article is the one
 * status refused: it has been withdrawn, and bringing it back is a decision
 * (restore) rather than a side effect of publishing.
 */
const PUBLISHABLE = Object.freeze(['draft', 'in_review', 'published']);

async function publish(actor, ref, input = {}) {
  kb.assertCan(actor, 'kb.publish');
  const article = await requireVisible(actor, ref);
  if (!PUBLISHABLE.includes(article.status)) {
    throw new ValidationError(
      `a ${article.status} article cannot be published — restore it first`,
      { status: article.status }
    );
  }
  if (!article.body || !String(article.body).trim()) {
    throw new ValidationError('an article with no body cannot be published');
  }

  const now = new Date();
  const reviewDue = input.review_due_at === undefined
    ? article.review_due_at
    : parseDate(input.review_due_at, 'review_due_at');

  const published = await withTransaction(async () => {
    const version = (await kbRepo.latestVersionNumber(article.id)) + 1;
    await kbRepo.insertVersion({
      article_id: article.id,
      version,
      title: article.title,
      summary: article.summary,
      body: article.body,
      body_format: article.body_format,
      published_by: actor && actor.id ? actor.id : null,
      published_at: now,
      change_note: bounded(input.change_note, 500, 'change_note'),
    });
    const row = await kbRepo.updateArticle(article.id, {
      status: 'published',
      published_at: now,
      archived_at: null,
      review_due_at: reviewDue,
      version,
    });
    await emit({
      eventName: 'helpdesk.kb.article.published',
      entityUid: ARTICLE_UID,
      documentId: article.documentId,
      tenantId: kbRepo.tenantId(),
      actor: eventActor(actor),
      payload: {
        articleId: article.id, slug: article.slug, title: article.title,
        visibility: article.visibility, locale: article.locale, version,
        // §11.4: the author is notified when their article publishes, and the
        // provenance link is what closes the loop from ticket to knowledge.
        authorId: article.author_id, sourceTicketId: article.source_ticket_id,
      },
    });
    return row;
  });

  return hydrate(published);
}

/**
 * Withdraw an article. `inbound` names the articles that link to this one —
 * archiving a page three others point at leaves three dead "see also" links,
 * and the archiver is the only person in a position to fix them.
 */
async function archive(actor, ref, input = {}) {
  kb.assertCan(actor, 'kb.archive');
  const article = await requireVisible(actor, ref);
  if (article.status === 'archived') return hydrate(article);

  const inbound = await kbRepo.inboundRelatedIds(article.id);
  const now = new Date();

  const archived = await withTransaction(async () => {
    const row = await kbRepo.updateArticle(article.id, { status: 'archived', archived_at: now });
    await emit({
      eventName: 'helpdesk.kb.article.archived',
      entityUid: ARTICLE_UID,
      documentId: article.documentId,
      tenantId: kbRepo.tenantId(),
      actor: eventActor(actor),
      payload: {
        articleId: article.id, slug: article.slug, title: article.title,
        reason: input.reason || null, inboundLinks: inbound.length,
      },
    });
    return row;
  });

  const out = await hydrate(archived);
  out.inbound_related_ids = inbound;
  return out;
}

/** archived → draft, so a withdrawn article can be corrected and republished. */
async function restore(actor, ref) {
  kb.assertCan(actor, 'kb.archive');
  const article = await requireVisible(actor, ref);
  if (article.status !== 'archived') {
    throw new ValidationError(`only an archived article can be restored — this one is ${article.status}`);
  }
  const updated = await kbRepo.updateArticle(article.id, { status: 'draft', archived_at: null });
  return hydrate(updated);
}

/**
 * Restore an old version — by writing a NEW one (§11.4). History is never
 * mutated: version 7 stays exactly what was published as version 7, and rolling
 * back to it produces version N+1 whose `rolled_back_from` says where it came
 * from. Anything else rewrites the past to look like the present, and a version
 * history that can be edited is not a history.
 */
async function rollback(actor, ref, input = {}) {
  kb.assertCan(actor, 'kb.publish');
  const article = await requireVisible(actor, ref);

  const target = Number(input.version);
  if (!Number.isFinite(target) || target < 1) throw new ValidationError('version is required');
  const snapshot = await kbRepo.findVersion(article.id, target);
  if (!snapshot) throw new ValidationError(`this article has no version ${target}`, { version: target });

  const now = new Date();
  const rolled = await withTransaction(async () => {
    const version = (await kbRepo.latestVersionNumber(article.id)) + 1;
    await kbRepo.insertVersion({
      article_id: article.id,
      version,
      title: snapshot.title,
      summary: snapshot.summary,
      body: snapshot.body,
      body_format: snapshot.body_format,
      published_by: actor && actor.id ? actor.id : null,
      published_at: now,
      change_note: bounded(input.change_note, 500, 'change_note')
        || `Rolled back to version ${target}`,
      rolled_back_from: target,
    });
    const row = await kbRepo.updateArticle(article.id, {
      title: snapshot.title,
      summary: snapshot.summary,
      body: snapshot.body,
      body_format: snapshot.body_format,
      status: 'published',
      published_at: now,
      archived_at: null,
      version,
    });
    await emit({
      eventName: 'helpdesk.kb.article.rolled_back',
      entityUid: ARTICLE_UID,
      documentId: article.documentId,
      tenantId: kbRepo.tenantId(),
      actor: eventActor(actor),
      payload: { articleId: article.id, slug: article.slug, restoredFrom: target, version },
    });
    return row;
  });

  return hydrate(rolled);
}

// ── author from a resolved ticket (§11.4) ─────────────────────────────────

/**
 * The single most important authoring path: it turns work already done into
 * reusable knowledge with almost no extra effort. One call carries the ticket's
 * problem statement and its resolution into a draft and links `source_ticket`.
 *
 * IDEMPOTENT BY PROVENANCE. A second call for the same ticket returns the draft
 * the first one made rather than a second copy — "one click" gets clicked
 * twice, and two half-written articles about one incident is the outcome that
 * makes people stop using the button.
 */
async function draftFromTicket(actor, ticketRef, input = {}) {
  kb.assertCan(actor, 'kb.author');

  const ticketService = require('./ticket.service');
  // Entitlement-gated: an author may only mine a ticket they can read.
  const ticket = await ticketService.findOne(actor, ticketRef);

  const existing = await kbRepo.listArticles(
    kb.readScope(actor, { includeArchived: true }),
    { filters: { sourceTicketId: ticket.id }, pageSize: 1 }
  );
  if (existing.rows.length) {
    const article = await hydrate(existing.rows[0]);
    article.reused_existing_draft = true;
    return article;
  }

  const problem = String(ticket.message || '').trim();
  const resolution = String(ticket.resolution || '').trim();
  // A ticket with no resolution has no knowledge in it yet. Refusing is kinder
  // than producing a draft whose answer section is empty and whose author
  // discovers that after publishing it.
  if (!resolution) {
    throw new ValidationError(
      `ticket ${ticket.ticket_no} has no resolution to turn into an article — resolve it first`,
      { ticket: ticket.documentId, status: ticket.status }
    );
  }

  const body = [
    '## Problem',
    problem || '_(no problem statement was recorded on the ticket)_',
    '',
    '## Resolution',
    resolution,
  ].join('\n');

  return create(actor, {
    title: input.title || ticket.subject,
    summary: input.summary === undefined ? resolution.slice(0, 300) : input.summary,
    body: input.body || body,
    body_format: 'markdown',
    locale: input.locale || 'en',
    visibility: input.visibility,
    category: input.category,
    category_id: input.category_id,
    tags: input.tags || ticket.tags || [],
    // The desk the work was done on is the desk the answer is relevant to —
    // a tag, not ownership (§11.2).
    desk_ids: input.desk_ids || (ticket.desk_id ? [ticket.desk_id] : []),
    review_due_at: input.review_due_at,
    source_ticket_id: ticket.id,
    source_kind: 'ticket',
    source_ref: ticket.ticket_no || ticket.documentId,
  });
}

// ── feedback and deflection (§11.6) ───────────────────────────────────────

/**
 * The reader's identity for measurement, and nothing else. A client-supplied
 * opaque key when there is one; otherwise a daily hash of ip + user agent.
 *
 * The fallback is a RATE LIMIT EXPRESSED AS A KEY, not an identity: it exists
 * so an anonymous reader who sends nothing cannot vote a thousand times. It is
 * hashed and day-scoped precisely so this table does not become a log of who
 * read which help article — a raw ip in a row that says "found this unhelpful"
 * is a record nobody asked us to keep.
 */
function sessionKeyFor(actor, input = {}, request = {}) {
  const supplied = String(input.session_key || input.sessionKey || '').trim();
  if (supplied) return `s:${supplied.slice(0, 120)}`;
  if (actor && actor.id) return `u:${actor.id}`;
  const day = new Date().toISOString().slice(0, 10);
  const material = `${request.ip || ''}|${request.userAgent || ''}|${day}`;
  return `a:${crypto.createHash('sha256').update(material).digest('hex').slice(0, 40)}`;
}

/**
 * Helpful / not helpful (§11.7). Deduped per reader per article: the ledger
 * row is the vote and the counter is the read model, kept in step inside one
 * transaction. A reader who changes their mind FLIPS their existing vote —
 * both counters move — rather than adding a second one.
 */
async function feedback(actor, ref, input = {}, request = {}) {
  const kind = String(input.kind || '').trim().toLowerCase();
  if (!FEEDBACK_KINDS.includes(kind)) {
    throw new ValidationError(`kind must be one of ${FEEDBACK_KINDS.join(', ')}`, { kind: input.kind });
  }
  // Read scope first: feedback on an article the caller cannot see is a probe.
  const article = await kbRepo.findArticle(ref, kb.readScope(actor));
  if (!article) throw new NotFoundError('Not Found');

  const sessionKey = sessionKeyFor(actor, input, request);
  const comment = bounded(input.comment, MAX_COMMENT, 'comment');
  const existing = await kbRepo.findFeedback(article.id, sessionKey, FEEDBACK_KINDS);

  if (existing && existing.kind === kind) {
    return { article: article.documentId, kind, counted: false, reason: 'already recorded' };
  }

  const counterOf = (k) => (k === 'helpful' ? 'helpful_count' : 'unhelpful_count');

  await withTransaction(async () => {
    if (existing) {
      await kbRepo.updateFeedbackKind(existing.id, kind);
      await kbRepo.bumpCounter(article.id, counterOf(existing.kind), -1);
    } else {
      await kbRepo.insertFeedback({
        article_id: article.id,
        kind,
        session_key: sessionKey,
        user_id: actor && actor.id ? actor.id : null,
        surface: kb.surfaceFor(actor),
        comment,
      });
    }
    await kbRepo.bumpCounter(article.id, counterOf(kind));
    await emit({
      eventName: 'helpdesk.kb.article.feedback_received',
      entityUid: ARTICLE_UID,
      documentId: article.documentId,
      tenantId: kbRepo.tenantId(),
      actor: eventActor(actor),
      payload: {
        articleId: article.id, slug: article.slug, kind,
        surface: kb.surfaceFor(actor), changedFrom: existing ? existing.kind : null,
        hasComment: Boolean(comment),
      },
    });
  });

  return { article: article.documentId, kind, counted: true, changed_from: existing ? existing.kind : null };
}

/**
 * The deflection signal (§11.6), reported by the surface that knows the answer.
 *
 * WHY THE CLIENT REPORTS IT. The measurement §11.6 describes is "the requester
 * opened an article and then abandoned the form" versus "opened it and
 * submitted anyway". Only the composing surface knows which happened —
 * abandonment is the absence of an action, and the server cannot distinguish it
 * from a browser that crashed, a tab left open, or a reader who went to make
 * tea. Inferring it from a timeout would produce a deflection number that
 * measures session length.
 *
 * BOTH NUMBERS ARE RECORDED. A failed deflection is not a non-event to be
 * dropped — it is the signal that the article is wrong or unclear, and §11.6 is
 * explicit that a KB report which only counts successes teaches nobody
 * anything. When the surface knows which ticket was raised anyway, it says so,
 * and the failed deflection stops being a tally and becomes something an author
 * can act on.
 */
async function recordDeflection(actor, ref, input = {}, request = {}) {
  const outcome = String(input.outcome || '').trim().toLowerCase();
  const kind = outcome === 'deflected' ? 'deflected'
    : (outcome === 'submitted' || outcome === 'failed' ? 'failed_deflection' : null);
  if (!kind) {
    throw new ValidationError('outcome must be "deflected" (no ticket was raised) or "submitted"',
      { outcome: input.outcome });
  }

  const article = await kbRepo.findArticle(ref, kb.readScope(actor));
  if (!article) throw new NotFoundError('Not Found');

  const sessionKey = sessionKeyFor(actor, input, request);
  const existing = await kbRepo.findFeedback(article.id, sessionKey, DEFLECTION_KINDS);
  if (existing) {
    return { article: article.documentId, outcome: existing.kind, counted: false, reason: 'already recorded' };
  }

  let ticketId = null;
  if (kind === 'failed_deflection' && input.ticket) {
    try {
      const ticketService = require('./ticket.service');
      const ticket = await ticketService.findOne(actor, input.ticket);
      ticketId = ticket.id;
    } catch (err) {
      // A ticket reference we cannot resolve must not lose the measurement —
      // the failed deflection happened either way.
      warn(`[helpdesk.kb] deflection ticket ${input.ticket} not readable: ${err.message}`);
    }
  }

  await withTransaction(async () => {
    await kbRepo.insertFeedback({
      article_id: article.id,
      kind,
      session_key: sessionKey,
      user_id: actor && actor.id ? actor.id : null,
      surface: kb.surfaceFor(actor),
      ticket_id: ticketId,
    });
    await kbRepo.bumpCounter(
      article.id,
      kind === 'deflected' ? 'deflection_count' : 'failed_deflection_count'
    );
    await emit({
      eventName: 'helpdesk.kb.deflection',
      entityUid: ARTICLE_UID,
      documentId: article.documentId,
      tenantId: kbRepo.tenantId(),
      actor: eventActor(actor),
      payload: {
        articleId: article.id, slug: article.slug, outcome: kind,
        surface: kb.surfaceFor(actor), ticketId,
      },
    });
  });

  return { article: article.documentId, outcome: kind, counted: true, ticket_id: ticketId };
}

/**
 * The effectiveness report for one article (§11.10). Read straight off the
 * counters rather than aggregated from the ledger, because ranking uses the
 * same numbers and a report that disagreed with the ranking would be a bug
 * nobody could see.
 */
async function effectiveness(actor, ref) {
  kb.assertCan(actor, 'kb.author');
  const article = await requireVisible(actor, ref);
  const votes = article.helpful_count + article.unhelpful_count;
  const attempts = article.deflection_count + article.failed_deflection_count;
  return {
    article: article.documentId,
    slug: article.slug,
    view_count: article.view_count,
    helpful_count: article.helpful_count,
    unhelpful_count: article.unhelpful_count,
    helpfulness_ratio: votes ? article.helpful_count / votes : null,
    deflection_count: article.deflection_count,
    failed_deflection_count: article.failed_deflection_count,
    // Reported alongside its failure, always — see recordDeflection.
    deflection_rate: attempts ? article.deflection_count / attempts : null,
    failed_deflection_rate: attempts ? article.failed_deflection_count / attempts : null,
  };
}

/** The KB's backlog: what people searched for and did not find (§11.10). */
async function searchGaps(actor, options = {}) {
  kb.assertCan(actor, 'kb.review');
  return kbRepo.topSearchMisses({ surface: options.surface || null, limit: options.limit });
}

// ── staleness sweep (§11.4) ───────────────────────────────────────────────

/**
 * Flag published articles whose review has come due.
 *
 * IT DOES NOT UNPUBLISH BY DEFAULT, AND THAT IS A DELIBERATE READING OF §11.4.
 * The spec's "an article nobody will vouch for is worse than no article" argues
 * for withdrawal; the sweep, however, cannot tell stale from merely old, and
 * pulling a working answer off the customer help pages on a timer removes
 * something that was deflecting tickets this morning without any human deciding
 * it was wrong. So the default is to raise `helpdesk.kb.article.review_due` —
 * which is what drives the review queue and the notification — and leave the
 * article live. A tenant that wants the stricter stance sets
 * RUTBA_CORE_HELPDESK_KB_REVIEW_UNPUBLISH=1 and gets it.
 *
 * IT RE-NAGS RATHER THAN SPAMS. After flagging, `review_due_at` moves forward
 * by the grace window, so an article nobody reviews is raised again next week
 * instead of every night. Without that, an ignored article produces one event
 * per article per day forever, and the review queue becomes noise nobody reads
 * — which is the same failure as not having one.
 *
 * Registered through registerCron and therefore gated by RUTBA_CORE_CRONS=1,
 * exactly like the SLA sweep. Requiring this file registers it; nothing runs
 * until startCrons().
 */
async function reviewSweep(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const batch = options.batchSize || intEnv('RUTBA_CORE_HELPDESK_KB_REVIEW_BATCH', 100);
  const maxBatches = options.maxBatches || intEnv('RUTBA_CORE_HELPDESK_KB_REVIEW_MAX_BATCHES', 50);
  const graceDays = intEnv('RUTBA_CORE_HELPDESK_KB_REVIEW_GRACE_DAYS', 7);
  const unpublish = options.unpublish !== undefined
    ? options.unpublish
    : get('RUTBA_CORE_HELPDESK_KB_REVIEW_UNPUBLISH') === '1';

  const { systemActor } = require('./policy/entitlement');
  const actor = systemActor('helpdesk.kb.review-sweep', { kind: 'system', source: 'cron' });
  const nextDue = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);

  let cursor = 0;
  let flagged = 0;
  for (let pass = 0; pass < maxBatches; pass++) {
    const rows = await kbRepo.findReviewDue(now, { afterId: cursor, limit: batch });
    if (!rows.length) return { flagged, complete: true };
    for (const article of rows) {
      cursor = article.id;
      try {
        await withTransaction(async () => {
          await kbRepo.updateArticle(article.id, {
            review_due_at: nextDue,
            ...(unpublish ? { status: 'in_review' } : {}),
          });
          await emit({
            eventName: 'helpdesk.kb.article.review_due',
            entityUid: ARTICLE_UID,
            documentId: article.documentId,
            tenantId: kbRepo.tenantId(),
            actor: eventActor(actor),
            payload: {
              articleId: article.id, slug: article.slug, title: article.title,
              authorId: article.author_id, reviewerId: article.reviewer_id,
              reviewDueAt: article.review_due_at, unpublished: unpublish,
              nextReviewDueAt: nextDue.toISOString(),
            },
          });
        });
        flagged++;
      } catch (err) {
        // One unflaggable article must not stop the sweep reaching the rest.
        warn(`[helpdesk.kb] review sweep failed on ${article.documentId}: ${err.message}`);
      }
    }
  }
  warn(`[helpdesk.kb] review sweep stopped after ${maxBatches} batches at article id ${cursor}`
    + ' — raise RUTBA_CORE_HELPDESK_KB_REVIEW_MAX_BATCHES');
  return { flagged, complete: false };
}

registerCron(SWEEP_CRON, get('RUTBA_CORE_HELPDESK_KB_REVIEW_RULE', '17 4 * * *'), () => reviewSweep());

module.exports = {
  ARTICLE_UID,
  SWEEP_CRON,
  LOCALES,
  FEEDBACK_KINDS,

  slugify,
  sessionKeyFor,

  find,
  findOne,
  suggest,
  versions,

  create,
  update,
  submitReview,
  reject,
  publish,
  archive,
  restore,
  rollback,
  draftFromTicket,

  feedback,
  recordDeflection,
  effectiveness,
  searchGaps,

  reviewSweep,

  ValidationError,
  NotFoundError,
};
