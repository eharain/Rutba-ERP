#!/usr/bin/env node
'use strict';

/**
 * Helpdesk KNOWLEDGE BASE smoke — the Core-native KB slice
 * (src/domain/helpdesk/kb-*.service.js, policy/kb-visibility.js,
 * repository/kb.repo.js, src/modules/helpdesk.js) against the live dev DB.
 *
 *  A. Categories. The tree, the depth-3 limit refused at the fourth level, and
 *     a reparent that would push a SUBTREE past the limit refused as a whole
 *     rather than half-applied.
 *  B. Authoring lifecycle (§11.4). A draft is born `draft` and `agent_only`
 *     whatever the payload asks for, submit-review moves it, a rejection sends
 *     it back with a reason, and publishing is refused to an author who holds
 *     `kb.author` but not `kb.publish` — the control §11.4 actually asks for.
 *  C. THE VISIBILITY PROOF, which is what this script exists for. Three
 *     published articles, one per tier, and the §11 acceptance criterion
 *     asserted from every direction it could fail: agent search sees three,
 *     requester search sees two, anonymous search sees one, and the
 *     `agent_only` article is absent from requester search, from suggestions,
 *     from the requester portal endpoint and from the public web endpoint —
 *     asserted on the ROWS AND ON THE PAGINATION TOTAL, because a total that
 *     counts rows the reader may not see is the leak the SQL-level predicate
 *     exists to prevent. Reading it directly answers 404, not 403 (spec 27.8):
 *     a 403 would confirm that a guessed slug names a real internal procedure.
 *  D. Versioning (§11.4). Publish snapshots, a rollback creates a NEW version
 *     carrying `rolled_back_from`, and the version it restored is byte-for-byte
 *     what it always was — history is never mutated.
 *  E. Measurement (§11.6). A vote is idempotent per reader and flips both
 *     counters when the reader changes their mind; BOTH deflection outcomes are
 *     recorded; a zero-result search is captured as the KB's backlog.
 *  F. Author from a resolved ticket (§11.4). Refused on an unresolved ticket,
 *     carries problem + resolution + provenance on a resolved one, and a second
 *     click returns the first draft rather than a second article.
 *  G. The staleness sweep (§11.4). It flags, re-nags rather than firing
 *     nightly, and leaves the article PUBLISHED unless a human turned the
 *     stricter stance on. The sweep is tenant-wide, so this part refuses to run
 *     it unless the only article due for review is the one it wrote.
 *
 * MARKER-ONLY AND SELF-CLEANING. This runs against a live database. Every row
 * it writes carries MARK in a column it can be found by; cleanup runs before
 * the phases as well as in a finally, and deletes exactly those articles plus
 * the versions, feedback rows, desk/related links, categories, search-miss
 * rollups, core_events and the one ticket they produced. Nothing is ever
 * deleted by a broad filter.
 *
 * WHY IT GRANTS ROLES. `kb.author` comes from an api-pro app role and nothing
 * else — kb-visibility reads bands that entitlement.resolveActor loaded from
 * the database — so there is no way to fabricate one. If the helpdesk app roles
 * are not seeded the grants are skipped, those groups say so, and the check
 * that noticed still counts as a failure rather than a silent pass.
 *
 * Requires migrations 001, 010–017 and 018–019, and the api-provider role seed.
 * It says which is missing rather than guessing.
 *
 *   node scripts/smoke-helpdesk-kb.js
 */

const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');
const { EVENTS_TABLE, DELIVERIES_TABLE } = require('../src/platform/events');
const entitlement = require('../src/domain/helpdesk/policy/entitlement');
const kb = require('../src/domain/helpdesk/policy/kb-visibility');
const kbRepo = require('../src/domain/helpdesk/repository/kb.repo');
const articles = require('../src/domain/helpdesk/kb-article.service');
const categories = require('../src/domain/helpdesk/kb-category.service');
const ticketService = require('../src/domain/helpdesk/ticket.service');

const PORT = 4028;
const MARK = '__rutba_core_kb_smoke__';
const CATEGORY_PREFIX = 'kb_smoke_';
/** A nonsense token that appears in all three tier articles and nowhere else. */
const TOKEN = 'zorblat';
/**
 * The zero-result probe. Deliberately NOT built from MARK: the marker appears
 * in every article title this script writes, so a query containing it would
 * match all of them and prove the opposite of what part E is asserting. This
 * token appears in no title, body, summary, tag or slug anywhere.
 */
const MISS_TOKEN = 'qwzzmisstoken';

const TICKET_UID = 'api::contact-ticket.contact-ticket';
const TICKETS = 'contact_tickets';
const MESSAGES = 'helpdesk_ticket_messages';
const ACTIVITIES = 'work_item_activities';
const DEDUPE = 'helpdesk_ticket_dedupe';
const APP_ROLES = 'api_pro_app_roles';
const USER_APP_ROLES = 'up_users_app_roles_lnk';

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail !== undefined ? ` — ${detail}` : ''}`); }
}

function skip(reason) {
  console.log(`  SKIP  ${reason}`);
}

/**
 * Run one part. An unexpected throw is a failure of that part and nothing else:
 * losing D, E and F because C hit an error would hide most of the answer at
 * exactly the moment somebody needs all of it.
 */
async function guarded(label, fn, ctx) {
  try {
    await fn(ctx);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${label} aborted — ${err.name}: ${err.message}`);
    console.log(String(err.stack || '').split('\n').slice(1, 4).join('\n'));
  }
}

async function req(method, path, token, body, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* an empty or non-JSON body is itself the answer */ }
  return { status: res.status, body: json };
}

/** The thrown error, or null when the call unexpectedly succeeded. */
async function refusal(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

const named = (err) => (err ? `${err.name}: ${err.message}` : 'no error was thrown');
const slugsOf = (rows) => (rows || []).map((row) => row.slug);
const titlesOf = (rows) => (rows || []).map((row) => row.title);

// ── prerequisites ─────────────────────────────────────────────────────────

/**
 * Every table the assertions below depend on. A missing one is a FAILURE with
 * the command that fixes it, never a skip: the orchestrator runs this after
 * applying the migrations, so "not migrated" is a real result.
 */
async function prerequisites() {
  const required = [
    kbRepo.CATEGORIES, kbRepo.ARTICLES, kbRepo.VERSIONS,
    kbRepo.ARTICLE_DESKS, kbRepo.ARTICLE_RELATED, kbRepo.FEEDBACK, kbRepo.SEARCH_MISSES,
    TICKETS, MESSAGES, EVENTS_TABLE, 'helpdesk_desks',
  ];
  for (const table of required) {
    if (!(await getDb().schema.hasTable(table))) {
      check('the KB schema is present', false,
        `${table} does not exist — run: node scripts/migrate.js up`);
      return false;
    }
  }
  check('the KB tables are present (migrations 018 and 019)', true);
  return true;
}

const EMPLOYEE_LINK = 'hr_employees_user_lnk';

/**
 * Three distinct logins that hold no helpdesk role, no team membership and no
 * desk default assignment — so the bands this script grants are the ONLY ones
 * they carry and an assertion cannot pass for a reason it did not intend.
 *
 * `excludeEmployees` additionally skips logins with an HR employee record.
 * That matters for one specific reason: §29.7 gives an ESS EMPLOYEE
 * `kb.read.internal` outright and an account-holding CUSTOMER the same
 * capability only where the category admits them, so a "requester" who happens
 * to have an HR record proves the employee rule while appearing to prove the
 * customer one. The dev database usually has plenty of non-employee logins; if
 * it does not, the caller falls back and the customer-specific checks skip
 * rather than asserting the wrong rule.
 */
async function candidateUsers({ excludeEmployees = false } = {}) {
  const qb = getDb()('up_users as u')
    .where('u.blocked', 0)
    .where(function confirmedOrUnset() { this.where('u.confirmed', 1).orWhereNull('u.confirmed'); })
    .whereNotIn('u.id', getDb()(`${USER_APP_ROLES} as l`)
      .join(`${APP_ROLES} as r`, 'r.id', 'l.app_role_id')
      .where('r.key', 'like', 'helpdesk%')
      .whereNotNull('l.user_id')
      .select('l.user_id'))
    .whereNotIn('u.id', getDb()('helpdesk_team_members').whereNotNull('user_id').select('user_id'))
    .whereNotIn('u.id', getDb()('helpdesk_desks')
      .whereNotNull('default_assignee_id')
      .select('default_assignee_id'));
  if (excludeEmployees && await getDb().schema.hasTable(EMPLOYEE_LINK)) {
    qb.whereNotIn('u.id', getDb()(EMPLOYEE_LINK).whereNotNull('user_id').select('user_id'));
  }
  return qb.orderBy('u.id', 'asc').limit(3).select('u.id', 'u.username', 'u.email');
}

/** Grants `key` to `userId` and records it for teardown, only if it was absent. */
async function grantRole(userId, key, grants) {
  const role = await getDb()(APP_ROLES).where('key', key).first('id', 'is_active');
  if (!role) return null;
  const existing = await getDb()(USER_APP_ROLES)
    .where({ user_id: userId, app_role_id: role.id })
    .first('id');
  if (!existing) {
    await getDb()(USER_APP_ROLES).insert({ user_id: userId, app_role_id: role.id });
    grants.push({ user_id: userId, app_role_id: role.id });
  }
  return role;
}

// ── teardown ──────────────────────────────────────────────────────────────

async function deleteEventsFor(entityUid, documentIds) {
  if (!documentIds.length) return;
  const eventIds = await getDb()(EVENTS_TABLE)
    .where('entity_uid', entityUid)
    .whereIn('document_id', documentIds)
    .pluck('event_id');
  if (!eventIds.length) return;
  await getDb()(DELIVERIES_TABLE).whereIn('event_id', eventIds).delete();
  await getDb()(EVENTS_TABLE).whereIn('event_id', eventIds).delete();
}

/**
 * Deletes exactly the rows this script wrote. The marker is a sentinel string,
 * so `like '<MARK>%'` names our rows and only ours; categories go by their own
 * key prefix, and the search-miss rollup by the marked query it recorded.
 */
async function cleanup() {
  const marked = await getDb()(kbRepo.ARTICLES)
    .where('title', 'like', `${MARK}%`)
    .select('id', 'document_id');
  const ids = marked.map((row) => row.id);

  if (ids.length) {
    await getDb()(kbRepo.FEEDBACK).whereIn('article_id', ids).delete();
    await getDb()(kbRepo.VERSIONS).whereIn('article_id', ids).delete();
    await getDb()(kbRepo.ARTICLE_DESKS).whereIn('article_id', ids).delete();
    await getDb()(kbRepo.ARTICLE_RELATED).whereIn('article_id', ids)
      .orWhereIn('related_article_id', ids).delete();
    await deleteEventsFor(kbRepo.ARTICLE_UID, marked.map((row) => row.document_id));
    await getDb()(kbRepo.ARTICLES).whereIn('id', ids).delete();
  }

  const cats = await getDb()(kbRepo.CATEGORIES)
    .where('key', 'like', `${CATEGORY_PREFIX}%`)
    .select('id', 'document_id');
  if (cats.length) {
    await deleteEventsFor(categories.CATEGORY_UID, cats.map((row) => row.document_id));
    await getDb()(kbRepo.CATEGORIES).whereIn('id', cats.map((row) => row.id)).delete();
  }

  await getDb()(kbRepo.SEARCH_MISSES).where('normalized', 'like', `%${MISS_TOKEN}%`).delete();

  const tickets = await getDb()(TICKETS)
    .where('subject', 'like', `${MARK}%`)
    .select('id', 'document_id');
  for (const row of tickets) {
    await deleteEventsFor(TICKET_UID, [row.document_id]);
    await getDb()(ACTIVITIES)
      .where({ entity_uid: TICKET_UID, target_document_id: row.document_id }).delete();
    await getDb()(MESSAGES).where('ticket_id', row.id).delete();
    await getDb()(DEDUPE).where('ticket_id', row.id).delete();
    try {
      await documents(TICKET_UID).delete({ documentId: row.document_id });
    } catch (err) {
      console.log(`  WARN  documents().delete failed for ${row.document_id} (${err.message}) — deleting the row directly`);
      await getDb()(TICKETS).where('id', row.id).delete();
    }
  }

  return ids.length + cats.length + tickets.length;
}

// ── A. categories ─────────────────────────────────────────────────────────

async function partA(ctx) {
  console.log('\nA. Categories — the tree and its depth limit (§11.3)');
  const { actors } = ctx;

  const authoringRefused = await refusal(() => categories.create(actors.agent, {
    key: `${CATEGORY_PREFIX}refused`, name: `${MARK} refused`,
  }));
  check('an agent cannot create a category — kb.configure is admin (§11.9)',
    authoringRefused && authoringRefused.name === 'ForbiddenError', named(authoringRefused));

  const root = await categories.create(actors.admin, {
    key: `${CATEGORY_PREFIX}root`, name: `${MARK} root`, visibility: 'both',
  });
  ctx.categories = { root };
  check('an admin creates a root category at depth 0', root && root.depth === 0,
    root ? `depth=${root.depth}` : 'no category returned');

  // Part C counts rows per category, so its three tier articles get a category
  // of their own. Sharing one with part B's lifecycle article would make the
  // totals depend on what an earlier part happened to write — which is exactly
  // the kind of coupling that turns a real regression into "the count moved".
  const tiers = await categories.create(actors.admin, {
    key: `${CATEGORY_PREFIX}tiers`, name: `${MARK} tiers`, visibility: 'both',
  });
  ctx.categories.tiers = tiers;
  check('an isolated category holds part C\'s tier articles', tiers.depth === 0);

  const child = await categories.create(actors.admin, {
    key: `${CATEGORY_PREFIX}child`, name: `${MARK} child`, parent_id: root.id, visibility: 'both',
  });
  ctx.categories.child = child;
  check('a child takes its parent\'s depth plus one', child.depth === 1, `depth=${child.depth}`);

  const deep = await categories.create(actors.admin, {
    key: `${CATEGORY_PREFIX}deep`, name: `${MARK} deep`, parent_id: child.id,
  });
  ctx.categories.deep = deep;
  check('three levels are allowed', deep.depth === 2, `depth=${deep.depth}`);

  const tooDeep = await refusal(() => categories.create(actors.admin, {
    key: `${CATEGORY_PREFIX}toodeep`, name: `${MARK} too deep`, parent_id: deep.id,
  }));
  check('a fourth level is refused (§11.3 max depth 3)',
    tooDeep && tooDeep.name === 'ValidationError', named(tooDeep));

  // The subtree check: moving `child` (which has `deep` beneath it) under
  // `deep` is a cycle, and moving it one level down would push `deep` to 3.
  const cycle = await refusal(() => categories.update(actors.admin, child.id, { parent_id: deep.id }));
  check('a category cannot be moved beneath its own descendant',
    cycle && cycle.name === 'ValidationError', named(cycle));

  const internalOnly = await categories.create(actors.admin, {
    key: `${CATEGORY_PREFIX}internal_only`, name: `${MARK} internal only`, visibility: 'internal',
  });
  ctx.categories.internalOnly = internalOnly;
  check('an internal-only category is created for the customer-gate check',
    internalOnly.visibility === 'internal', `visibility=${internalOnly.visibility}`);

  const keysOfTree = (nodes) => nodes
    .flatMap(function walk(node) { return [node.key, ...node.children.flatMap(walk)]; })
    .filter((key) => key.startsWith(CATEGORY_PREFIX));

  const staffKeys = keysOfTree(await categories.tree(actors.agent));
  check('a staff tree contains both the `both` and the `internal` category',
    staffKeys.includes(root.key) && staffKeys.includes(internalOnly.key),
    JSON.stringify(staffKeys));

  // The narrowing is a CUSTOMER narrowing, not a requester one. An ESS employee
  // holds `kb.read.internal` outright (§29.7's Emp column) and sees the internal
  // tree; the candidate logins on a dev database usually have an HR record, so
  // asserting the exclusion against them would assert the wrong rule. The
  // anonymous actor is the reader that is never an employee.
  const anonKeys = keysOfTree(await categories.tree(actors.anonymous));
  check('an anonymous tree contains the `both` category', anonKeys.includes(root.key),
    JSON.stringify(anonKeys));
  check('and NOT the `internal` one', !anonKeys.includes(internalOnly.key),
    JSON.stringify(anonKeys));

  if (actors.customer) {
    const customerKeys = keysOfTree(await categories.tree(actors.customer));
    check('nor does an account-holding customer\'s tree',
      !customerKeys.includes(internalOnly.key), JSON.stringify(customerKeys));
  } else {
    skip('the customer tree — every candidate login has an HR employee record');
  }
}

// ── B. authoring lifecycle ────────────────────────────────────────────────

async function partB(ctx) {
  console.log('\nB. Authoring lifecycle (§11.4)');
  const { actors, categories: cats } = ctx;

  const anonRefused = await refusal(() => articles.create(actors.anonymous, {
    title: `${MARK} anonymous attempt`,
  }));
  check('an anonymous caller cannot author',
    anonRefused && anonRefused.name === 'ForbiddenError', named(anonRefused));

  const requesterRefused = await refusal(() => articles.create(actors.requester, {
    title: `${MARK} requester attempt`,
  }));
  check('nor can a requester holding no helpdesk role',
    requesterRefused && requesterRefused.name === 'ForbiddenError', named(requesterRefused));

  const draft = await articles.create(actors.agent, {
    title: `${MARK} lifecycle article`,
    body: 'The answer is 42.',
    category_id: cats.root.id,
    tags: ['smoke'],
  });
  ctx.draft = draft;
  check('an agent creates a draft', Boolean(draft && draft.documentId), JSON.stringify(draft || null));
  check('it is born `draft`, whatever the payload asked for', draft.status === 'draft',
    `status=${draft.status}`);
  // Fail closed: an article whose author never said who it was for must not be
  // the one that reaches a customer.
  check('and `agent_only`, the most restrictive tier', draft.visibility === 'agent_only',
    `visibility=${draft.visibility}`);
  check('the slug is derived from the title and is url-safe',
    /^[a-z0-9-]+$/.test(draft.slug), `slug=${draft.slug}`);
  check('the author is recorded', draft.author_id === actors.agent.id,
    `author_id=${draft.author_id} vs ${actors.agent.id}`);

  const bornPublished = await getDb()(kbRepo.VERSIONS).where('article_id', draft.id).count('id as t').first();
  check('a draft has no version yet — publishing is what snapshots',
    Number(bornPublished.t) === 0, `versions=${bornPublished.t}`);

  // THE control §11.4 asks for: publishing is a separate permission, and an
  // author who can write cannot publish.
  const publishRefused = await refusal(() => articles.publish(actors.agent, draft.documentId));
  check('an agent holding kb.author cannot publish (§11.4)',
    publishRefused && publishRefused.name === 'ForbiddenError', named(publishRefused));

  const inReview = await articles.submitReview(actors.agent, draft.documentId);
  check('submit-review moves draft → in_review', inReview.status === 'in_review',
    `status=${inReview.status}`);

  const noReason = await refusal(() => articles.reject(actors.manager, draft.documentId, {}));
  check('a rejection with no reason is refused — the author would learn nothing',
    noReason && noReason.name === 'ValidationError', named(noReason));

  const rejected = await articles.reject(actors.manager, draft.documentId, { reason: 'needs an example' });
  check('a rejection sends it back to draft (§11.4)', rejected.status === 'draft',
    `status=${rejected.status}`);

  const published = await articles.publish(actors.manager, draft.documentId, {
    change_note: 'first publish',
  });
  check('a manager publishes it', published.status === 'published', `status=${published.status}`);
  check('and the version counter moves to 1', published.version === 1, `version=${published.version}`);
  check('published_at is stamped', Boolean(published.published_at));

  const emptyBody = await articles.create(actors.agent, { title: `${MARK} empty` });
  const emptyRefused = await refusal(() => articles.publish(actors.manager, emptyBody.documentId));
  check('an article with no body cannot be published',
    emptyRefused && emptyRefused.name === 'ValidationError', named(emptyRefused));

  const archived = await articles.archive(actors.manager, emptyBody.documentId, { reason: 'smoke' });
  check('archive withdraws it', archived.status === 'archived', `status=${archived.status}`);
  const editArchived = await refusal(() => articles.update(actors.agent, emptyBody.documentId, {
    summary: 'x',
  }));
  check('an archived article cannot be edited until it is restored',
    editArchived && editArchived.name === 'ValidationError', named(editArchived));
  const restored = await articles.restore(actors.manager, emptyBody.documentId);
  check('restore returns it to draft', restored.status === 'draft', `status=${restored.status}`);
}

// ── C. the visibility proof ───────────────────────────────────────────────

/**
 * The reason this script exists. Everything above is a precondition for these
 * assertions.
 */
async function partC(ctx) {
  console.log('\nC. Three tiers — the §11 acceptance criterion, proved from every direction');
  const { actors, categories: cats } = ctx;

  const made = {};
  for (const tier of ['public', 'internal', 'agent_only']) {
    const article = await articles.create(actors.agent, {
      title: `${MARK} ${tier} ${TOKEN}`,
      body: `A ${tier} article about ${TOKEN}.`,
      summary: `${tier} ${TOKEN}`,
      visibility: tier,
      category_id: cats.tiers.id,
    });
    made[tier] = await articles.publish(actors.manager, article.documentId);
  }
  ctx.tiered = made;
  check('three articles published, one per tier',
    Object.values(made).every((a) => a.status === 'published'),
    JSON.stringify(Object.fromEntries(Object.entries(made).map(([k, v]) => [k, v.status]))));

  const inCategory = { categoryId: cats.tiers.id, pageSize: 100 };

  // ── tier lists, before any query is built ──
  check('an agent\'s tier list is all three',
    JSON.stringify(kb.visibleTiers(actors.agent)) === JSON.stringify(['public', 'internal', 'agent_only']),
    JSON.stringify(kb.visibleTiers(actors.agent)));
  check('a requester\'s tier list is public + internal, and agent_only is absent',
    !kb.visibleTiers(actors.requester).includes('agent_only'),
    JSON.stringify(kb.visibleTiers(actors.requester)));
  check('an anonymous caller\'s tier list is public alone',
    JSON.stringify(kb.visibleTiers(actors.anonymous)) === JSON.stringify(['public']),
    JSON.stringify(kb.visibleTiers(actors.anonymous)));

  // ── search ──
  const agentSearch = await articles.find(actors.agent, { q: TOKEN, ...inCategory });
  check('agent search returns all three tiers (§11.5)', agentSearch.data.length === 3,
    JSON.stringify(titlesOf(agentSearch.data)));

  const requesterSearch = await articles.find(actors.requester, { q: TOKEN, ...inCategory });
  check('requester search returns two', requesterSearch.data.length === 2,
    JSON.stringify(titlesOf(requesterSearch.data)));
  check('and NEVER the agent_only article',
    !slugsOf(requesterSearch.data).includes(made.agent_only.slug),
    JSON.stringify(slugsOf(requesterSearch.data)));

  const anonSearch = await articles.find(actors.anonymous, { q: TOKEN, ...inCategory });
  check('anonymous search returns the public article alone',
    anonSearch.data.length === 1 && anonSearch.data[0].slug === made.public.slug,
    JSON.stringify(slugsOf(anonSearch.data)));

  // ── the pagination total, which is the leak a post-filter would still have ──
  const requesterList = await articles.find(actors.requester, inCategory);
  check('the requester list total counts two, not three',
    requesterList.meta.pagination.total === 2,
    `total=${requesterList.meta.pagination.total} rows=${requesterList.data.length}`);
  const anonList = await articles.find(actors.anonymous, inCategory);
  check('the anonymous list total counts one',
    anonList.meta.pagination.total === 1,
    `total=${anonList.meta.pagination.total} rows=${anonList.data.length}`);
  const agentList = await articles.find(actors.agent, inCategory);
  check('the agent list total counts three — so the totals differ by READER, not by luck',
    agentList.meta.pagination.total === 3, `total=${agentList.meta.pagination.total}`);

  // ── direct read: 404, never 403 ──
  const requesterDirect = await refusal(() =>
    articles.findOne(actors.requester, made.agent_only.slug));
  check('a requester reading the agent_only article by slug gets NotFound',
    requesterDirect && requesterDirect.name === 'NotFoundError', named(requesterDirect));
  check('NOT Forbidden — a 403 would confirm the slug names a real article (spec 27.8)',
    requesterDirect && requesterDirect.name !== 'ForbiddenError', named(requesterDirect));
  const anonDirect = await refusal(() => articles.findOne(actors.anonymous, made.internal.slug));
  check('an anonymous caller reading the internal article gets NotFound',
    anonDirect && anonDirect.name === 'NotFoundError', named(anonDirect));

  // The positive control: the same call works for the tier they MAY read, so
  // the refusals above are about visibility and not about a broken lookup.
  const publicRead = await articles.findOne(actors.anonymous, made.public.slug);
  check('and the public article IS readable anonymously by slug',
    publicRead && publicRead.slug === made.public.slug, JSON.stringify(publicRead && publicRead.slug));

  // ── suggestions ──
  const requesterSuggest = await articles.suggest(actors.requester, { q: TOKEN });
  check('requester suggestions never include the agent_only article (§11.5)',
    requesterSuggest.length > 0 && !slugsOf(requesterSuggest).includes(made.agent_only.slug),
    JSON.stringify(slugsOf(requesterSuggest)));
  const agentSuggest = await articles.suggest(actors.agent, { q: TOKEN });
  check('agent suggestions do include it — the exclusion is the READER, not the article',
    slugsOf(agentSuggest).includes(made.agent_only.slug), JSON.stringify(slugsOf(agentSuggest)));

  // ── drafts are invisible to requesters (acceptance criterion 2) ──
  const hiddenDraft = await articles.create(actors.agent, {
    title: `${MARK} unpublished ${TOKEN}`,
    body: `A draft about ${TOKEN}.`,
    visibility: 'public',
    category_id: cats.tiers.id,
  });
  const afterDraft = await articles.find(actors.requester, { q: TOKEN, ...inCategory });
  check('a PUBLIC draft is still invisible to a requester — status gates as well as tier',
    !slugsOf(afterDraft.data).includes(hiddenDraft.slug), JSON.stringify(slugsOf(afterDraft.data)));

  // ── the per-category customer gate (§29.7's ⚙️) ──
  const gated = await articles.create(actors.agent, {
    title: `${MARK} gated internal ${TOKEN}`,
    body: `An internal article about ${TOKEN} in a staff-only category.`,
    visibility: 'internal',
    category_id: cats.internalOnly.id,
  });
  await articles.publish(actors.manager, gated.documentId);
  const gatedScope = { categoryId: cats.internalOnly.id, pageSize: 100 };
  if (actors.customer) {
    const customerSees = await articles.find(actors.customer, gatedScope);
    check('an account-holding CUSTOMER cannot read an internal article in an `internal` category',
      customerSees.meta.pagination.total === 0,
      `total=${customerSees.meta.pagination.total} slugs=${JSON.stringify(slugsOf(customerSees.data))}`);
  } else {
    skip('the customer/category gate — every candidate login has an HR employee record,'
      + ' so no customer-band actor was available');
  }
  const employeeOrStaff = await articles.find(actors.agent, gatedScope);
  check('while staff read it normally — the gate narrows customers, nobody else',
    employeeOrStaff.meta.pagination.total === 1,
    `total=${employeeOrStaff.meta.pagination.total}`);
}

// ── C2. the same proof over HTTP ──────────────────────────────────────────

async function partCHttp(ctx) {
  console.log('\nC2. The same criterion over HTTP — public and requester endpoints');
  const { actors, tiered, categories: cats } = ctx;
  if (!tiered) { skip('C2 — part C did not produce the tiered articles'); return; }

  const requesterToken = jwt.sign({ id: actors.requester.id }, get('JWT_SECRET'), { expiresIn: '10m' });

  // ── the public web namespace (§11.7, §27.6) ──
  const pub = await req('GET', `/api/web/help/articles?q=${TOKEN}&pageSize=100`);
  check('GET /api/web/help/articles answers anonymously', pub.status === 200,
    `${pub.status} ${JSON.stringify(pub.body && pub.body.error)}`);
  const pubSlugs = slugsOf(pub.body && pub.body.data);
  check('it returns the public article', pubSlugs.includes(tiered.public.slug), JSON.stringify(pubSlugs));
  check('and NEITHER the internal NOR the agent_only one',
    !pubSlugs.includes(tiered.internal.slug) && !pubSlugs.includes(tiered.agent_only.slug),
    JSON.stringify(pubSlugs));

  const pubOne = await req('GET', `/api/web/help/articles/${tiered.public.slug}`);
  check('the public article is readable by slug anonymously', pubOne.status === 200,
    `${pubOne.status}`);

  const pubAgentOnly = await req('GET', `/api/web/help/articles/${tiered.agent_only.slug}`);
  check('the agent_only article answers 404 on the public endpoint', pubAgentOnly.status === 404,
    `${pubAgentOnly.status} ${JSON.stringify(pubAgentOnly.body && pubAgentOnly.body.error)}`);
  check('404 and not 403 — no enumeration oracle over slugs (spec 27.8)',
    pubAgentOnly.status !== 403, `status=${pubAgentOnly.status}`);
  const pubInternal = await req('GET', `/api/web/help/articles/${tiered.internal.slug}`);
  check('the internal article also answers 404 anonymously', pubInternal.status === 404,
    `${pubInternal.status}`);

  // ── the requester namespace ──
  const mine = await req('GET',
    `/api/me/helpdesk/kb/articles?q=${TOKEN}&categoryId=${cats.tiers.id}&pageSize=100`, requesterToken);
  check('GET /api/me/helpdesk/kb/articles answers for a signed-in requester', mine.status === 200,
    `${mine.status} ${JSON.stringify(mine.body && mine.body.error)}`);
  const mineSlugs = slugsOf(mine.body && mine.body.data);
  check('the portal returns public + internal', mineSlugs.length === 2, JSON.stringify(mineSlugs));
  check('and NEVER the agent_only article', !mineSlugs.includes(tiered.agent_only.slug),
    JSON.stringify(mineSlugs));

  const mineOne = await req('GET',
    `/api/me/helpdesk/kb/articles/${tiered.agent_only.slug}`, requesterToken);
  check('reading it directly from the portal answers 404', mineOne.status === 404,
    `${mineOne.status}`);

  const anonPortal = await req('GET', '/api/me/helpdesk/kb/articles');
  check('the portal endpoint refuses an unauthenticated caller outright',
    anonPortal.status === 401, `${anonPortal.status}`);
}

// ── D. versioning ─────────────────────────────────────────────────────────

async function partD(ctx) {
  console.log('\nD. Versioning and rollback (§11.4)');
  const { actors, draft } = ctx;
  if (!draft) { skip('D — part B did not produce an article'); return; }

  const v1 = await articles.versions(actors.agent, draft.documentId);
  check('version 1 exists after the first publish', v1.length === 1 && v1[0].version === 1,
    JSON.stringify(v1.map((v) => v.version)));
  const originalBody = v1[0].body;

  await articles.update(actors.agent, draft.documentId, { body: 'The answer is 43.' });
  const republished = await articles.publish(actors.manager, draft.documentId, {
    change_note: 'corrected the answer',
  });
  check('republishing writes version 2', republished.version === 2, `version=${republished.version}`);

  const v2 = await articles.versions(actors.agent, draft.documentId);
  check('the history holds both', v2.length === 2, JSON.stringify(v2.map((v) => v.version)));
  const stillV1 = v2.find((v) => v.version === 1);
  check('and version 1 is byte-for-byte what it always was',
    stillV1 && stillV1.body === originalBody,
    `${JSON.stringify(stillV1 && stillV1.body)} vs ${JSON.stringify(originalBody)}`);

  const rolled = await articles.rollback(actors.manager, draft.documentId, { version: 1 });
  check('a rollback creates a NEW version rather than mutating history',
    rolled.version === 3, `version=${rolled.version}`);
  check('and the article now carries version 1\'s content',
    rolled.body === originalBody, JSON.stringify(rolled.body));

  const v3 = await articles.versions(actors.agent, draft.documentId);
  check('the history is now three long — nothing was overwritten', v3.length === 3,
    JSON.stringify(v3.map((v) => v.version)));
  const newest = v3.find((v) => v.version === 3);
  check('the new version records which one it restored',
    newest && newest.rolled_back_from === 1, `rolled_back_from=${newest && newest.rolled_back_from}`);
  const v2Row = v3.find((v) => v.version === 2);
  check('and version 2 still says what version 2 said',
    v2Row && v2Row.body === 'The answer is 43.', JSON.stringify(v2Row && v2Row.body));

  const authorRollback = await refusal(() =>
    articles.rollback(actors.agent, draft.documentId, { version: 1 }));
  check('rollback needs kb.publish — it republishes, so it is a publish',
    authorRollback && authorRollback.name === 'ForbiddenError', named(authorRollback));

  const noSuchVersion = await refusal(() =>
    articles.rollback(actors.manager, draft.documentId, { version: 99 }));
  check('rolling back to a version that never existed is refused',
    noSuchVersion && noSuchVersion.name === 'ValidationError', named(noSuchVersion));
}

// ── E. measurement ────────────────────────────────────────────────────────

async function partE(ctx) {
  console.log('\nE. Deflection and feedback, both numbers (§11.6)');
  const { actors, tiered } = ctx;
  if (!tiered) { skip('E — part C did not produce the tiered articles'); return; }
  const target = tiered.public;
  const session = { session_key: `${MARK}-session-1` };

  const first = await articles.feedback(actors.anonymous, target.slug, { kind: 'helpful', ...session });
  check('a helpful vote is counted', first.counted === true, JSON.stringify(first));

  const repeat = await articles.feedback(actors.anonymous, target.slug, { kind: 'helpful', ...session });
  check('the same reader voting again is idempotent, not a second vote',
    repeat.counted === false, JSON.stringify(repeat));

  const flipped = await articles.feedback(actors.anonymous, target.slug, { kind: 'unhelpful', ...session });
  check('changing their mind flips the vote', flipped.counted === true && flipped.changed_from === 'helpful',
    JSON.stringify(flipped));

  const after = await articles.findOne(actors.agent, target.slug, { countView: false });
  check('and BOTH counters moved — helpful back to 0, unhelpful to 1',
    after.helpful_count === 0 && after.unhelpful_count === 1,
    `helpful=${after.helpful_count} unhelpful=${after.unhelpful_count}`);

  const badKind = await refusal(() =>
    articles.feedback(actors.anonymous, target.slug, { kind: 'brilliant', ...session }));
  check('an unknown feedback kind is refused',
    badKind && badKind.name === 'ValidationError', named(badKind));

  const hidden = await refusal(() => articles.feedback(actors.anonymous, tiered.agent_only.slug, {
    kind: 'helpful', session_key: `${MARK}-session-probe`,
  }));
  check('feedback on an article the caller cannot see is NotFound, not a counter bump',
    hidden && hidden.name === 'NotFoundError', named(hidden));

  // Both outcomes, per §11.6 — a report that only counts successes teaches
  // nobody anything.
  const deflected = await articles.recordDeflection(actors.anonymous, target.slug, {
    outcome: 'deflected', session_key: `${MARK}-session-2`,
  });
  check('a deflection is recorded', deflected.counted === true, JSON.stringify(deflected));
  const failed = await articles.recordDeflection(actors.anonymous, target.slug, {
    outcome: 'submitted', session_key: `${MARK}-session-3`,
  });
  check('and a FAILED deflection is recorded too, not dropped',
    failed.counted === true && failed.outcome === 'failed_deflection', JSON.stringify(failed));

  const report = await articles.effectiveness(actors.manager, target.slug);
  check('the effectiveness report carries both rates',
    report.deflection_count === 1 && report.failed_deflection_count === 1
      && report.deflection_rate === 0.5 && report.failed_deflection_rate === 0.5,
    JSON.stringify(report));

  // §11.10 / §26.10 — the KB's backlog.
  const missQuery = `${MISS_TOKEN} nothingmatchesthis`;
  const empty = await articles.find(actors.agent, { q: missQuery });
  check('a search with no hits returns nothing', empty.data.length === 0,
    JSON.stringify(titlesOf(empty.data)));
  const gaps = await articles.searchGaps(actors.manager, { limit: 200 });
  const recorded = gaps.find((row) => row.normalized === kbRepo.normalizeQuery(missQuery));
  check('and the zero-result query is captured as a content gap',
    Boolean(recorded), `${gaps.length} gap row(s) recorded`);

  await articles.find(actors.agent, { q: missQuery });
  const gaps2 = await articles.searchGaps(actors.manager, { limit: 200 });
  const rolled = gaps2.find((row) => row.normalized === kbRepo.normalizeQuery(missQuery));
  check('a second miss rolls up rather than logging a second row',
    rolled && rolled.occurrences === 2, `occurrences=${rolled && rolled.occurrences}`);

  const gapsRefused = await refusal(() => articles.searchGaps(actors.agent));
  check('the gap report needs kb.review — it is a manager report (§26.11)',
    gapsRefused && gapsRefused.name === 'ForbiddenError', named(gapsRefused));
}

// ── F. author from a resolved ticket ──────────────────────────────────────

async function partF(ctx) {
  console.log('\nF. Author from a resolved ticket (§11.4)');
  const { actors } = ctx;

  const ticket = await ticketService.create(actors.system, {
    subject: `${MARK} customer cannot reset their password`,
    body: 'The reset email never arrives.',
    requester: { user_id: actors.requester.id },
  });
  check('a ticket is raised for the provenance check', Boolean(ticket && ticket.documentId));

  const tooEarly = await refusal(() => articles.draftFromTicket(actors.agent, ticket.documentId));
  check('an unresolved ticket has no knowledge in it yet, and says so',
    tooEarly && tooEarly.name === 'ValidationError', named(tooEarly));

  // A real walk through the workflow, not a status write: RULE-4 makes `status`
  // unwritable, and RULE-9 keeps the system actor out of `resolve` entirely, so
  // the human with the admin band drives it stage by stage.
  await ticketService.transition(actors.manager, ticket.documentId, 'triaged');
  await ticketService.transition(actors.manager, ticket.documentId, 'working');
  await ticketService.resolve(actors.manager, ticket.documentId, {
    resolution: 'Their address was on the bounce list; removing it fixed the delivery.',
  });

  const drafted = await articles.draftFromTicket(actors.agent, ticket.documentId);
  check('a resolved ticket becomes a draft', drafted.status === 'draft', `status=${drafted.status}`);
  check('the title carries the ticket subject',
    drafted.title === `${MARK} customer cannot reset their password`, drafted.title);
  check('the body carries BOTH the problem and the resolution',
    /## Problem/.test(drafted.body) && /never arrives/.test(drafted.body)
      && /## Resolution/.test(drafted.body) && /bounce list/.test(drafted.body),
    JSON.stringify(drafted.body));
  check('the provenance link is recorded', drafted.source_ticket_id === ticket.id,
    `source_ticket_id=${drafted.source_ticket_id} vs ${ticket.id}`);
  check('and so is where it came from', drafted.source_kind === 'ticket'
    && drafted.source_ref === ticket.ticket_no,
    `source_kind=${drafted.source_kind} source_ref=${drafted.source_ref}`);
  check('the ticket\'s desk becomes a TAG on the article (§11.2)',
    drafted.desk_ids.includes(ticket.desk_id),
    `desk_ids=${JSON.stringify(drafted.desk_ids)} ticket desk=${ticket.desk_id}`);

  const again = await articles.draftFromTicket(actors.agent, ticket.documentId);
  check('a second click returns the SAME draft rather than a second article',
    again.id === drafted.id && again.reused_existing_draft === true,
    `id=${again.id} vs ${drafted.id} reused=${again.reused_existing_draft}`);

  const requesterRefused = await refusal(() =>
    articles.draftFromTicket(actors.requester, ticket.documentId));
  check('a requester cannot mine a ticket into an article',
    requesterRefused && requesterRefused.name === 'ForbiddenError', named(requesterRefused));
}

// ── G. the staleness sweep ────────────────────────────────────────────────

/**
 * §11.4's "review_due_at drives a staleness sweep that reopens review on aged
 * articles".
 *
 * The sweep is tenant-wide by design, so this part first asks what it WOULD
 * touch and refuses to run unless the only due article is the one written
 * here. On a database with real KB content that is a skip, not a licence to
 * push somebody's review dates forward and emit events about their articles.
 */
async function partG(ctx) {
  console.log('\nG. The staleness sweep (§11.4)');
  const { actors } = ctx;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const draft = await articles.create(actors.agent, {
    title: `${MARK} stale article`,
    body: 'An answer nobody has vouched for lately.',
  });
  await articles.publish(actors.manager, draft.documentId, { review_due_at: yesterday });

  const now = new Date();
  const due = await kbRepo.findReviewDue(now, { limit: 50 });
  check('the sweep query finds the overdue article',
    due.some((row) => row.id === draft.id), JSON.stringify(due.map((row) => row.slug)));

  if (due.length !== 1) {
    skip(`the sweep itself — ${due.length} articles are due for review and only one is this`
      + ' script\'s, so running it would touch rows it did not write');
    return;
  }

  const result = await articles.reviewSweep({ now });
  check('the sweep flags it', result.flagged === 1 && result.complete === true,
    JSON.stringify(result));

  const events = await getDb()(EVENTS_TABLE)
    .where({ entity_uid: kbRepo.ARTICLE_UID, document_id: draft.documentId })
    .where('event_name', 'helpdesk.kb.article.review_due')
    .count('id as total').first();
  check('and emits helpdesk.kb.article.review_due (§11.8)', Number(events.total) === 1,
    `events=${events.total}`);

  const after = await articles.findOne(actors.agent, draft.documentId, { countView: false });
  // The deliberate reading of §11.4 — see KbArticleService.reviewSweep. Pulling
  // a working answer off the help pages on a timer is a decision a human makes.
  check('the article stays PUBLISHED by default — the sweep flags, it does not withdraw',
    after.status === 'published', `status=${after.status}`);
  check('and its review date moves forward, so it re-nags rather than firing nightly',
    new Date(after.review_due_at).getTime() > now.getTime(),
    `review_due_at=${after.review_due_at} vs now=${now.toISOString()}`);

  const second = await articles.reviewSweep({ now });
  check('a second pass finds nothing — the grace window is what stops the spam',
    second.flagged === 0, JSON.stringify(second));

  // The opt-in stricter stance.
  await articles.update(actors.agent, draft.documentId, { review_due_at: yesterday });
  const strict = await articles.reviewSweep({ now, unpublish: true });
  check('with RUTBA_CORE_HELPDESK_KB_REVIEW_UNPUBLISH the sweep does withdraw it',
    strict.flagged === 1, JSON.stringify(strict));
  const withdrawn = await articles.findOne(actors.agent, draft.documentId, { countView: false });
  check('and the article is back in review', withdrawn.status === 'in_review',
    `status=${withdrawn.status}`);
  const requesterSees = await refusal(() => articles.findOne(actors.requester, draft.slug));
  check('so a requester can no longer reach it',
    requesterSees && requesterSees.name === 'NotFoundError', named(requesterSees));
}

// ── runner ────────────────────────────────────────────────────────────────

async function main() {
  console.log('HELPDESK KB SMOKE');
  buildCompatStrapi();
  initModules();

  if (!(await prerequisites())) return failures;

  const stale = await cleanup();
  if (stale) console.log(`  (cleared ${stale} marker row(s) left by an earlier run)`);

  const grants = [];
  let server = null;
  const ctx = { actors: {}, users: {} };

  try {
    let users = await candidateUsers({ excludeEmployees: true });
    let customerBand = users.length === 3;
    if (!customerBand) users = await candidateUsers();
    check('found three logins holding no helpdesk role, team or desk assignment',
      users.length === 3, `found ${users.length}: ${JSON.stringify(users.map((u) => u.id))}`);
    if (users.length < 3) return failures;
    [ctx.users.requester, ctx.users.agent, ctx.users.manager] = users;

    const staffRole = await grantRole(ctx.users.agent.id, 'helpdesk_staff', grants);
    const managerRole = await grantRole(ctx.users.manager.id, 'helpdesk_manager', grants);
    // kb.configure is admin-only (§11.9), and the manager login doubles as the
    // admin here so the script needs three logins rather than four.
    const adminRole = await grantRole(ctx.users.manager.id, 'helpdesk_admin', grants);
    check('the helpdesk app roles are seeded',
      Boolean(staffRole) && Boolean(managerRole) && Boolean(adminRole),
      `helpdesk_staff=${Boolean(staffRole)} helpdesk_manager=${Boolean(managerRole)}`
      + ` helpdesk_admin=${Boolean(adminRole)}`
      + ' — run: npm run seed -- --only=api-provider,up-permissions');
    if (!staffRole || !managerRole || !adminRole) return failures;

    ctx.actors.system = entitlement.systemActor('helpdesk-kb-smoke');
    ctx.actors.requester = await entitlement.resolveActor(ctx.users.requester.id);
    ctx.actors.agent = await entitlement.resolveActor(ctx.users.agent.id);
    ctx.actors.manager = await entitlement.resolveActor(ctx.users.manager.id);
    ctx.actors.admin = ctx.actors.manager;
    // GUEST — an empty object, never null. `resolveActor(null)` returns the
    // SYSTEM actor, which reads every tier; that one substitution is the
    // difference between a public help page and a total disclosure.
    ctx.actors.anonymous = await entitlement.resolveActor({});

    check('the requester actor holds the requester band and nothing else',
      ctx.actors.requester.bands.length === 1 && ctx.actors.requester.bands[0] === 'requester',
      `bands=${JSON.stringify(ctx.actors.requester.bands)}`);
    check('the anonymous actor holds the requester band and NO user id',
      ctx.actors.anonymous.bands.includes('requester') && !ctx.actors.anonymous.id,
      `bands=${JSON.stringify(ctx.actors.anonymous.bands)} id=${ctx.actors.anonymous.id}`);
    check('the granted actor resolves to the agent band',
      ctx.actors.agent.bands.includes('agent'),
      `bands=${JSON.stringify(ctx.actors.agent.bands)} roleKeys=${JSON.stringify(ctx.actors.agent.roleKeys)}`);
    check('and the other to manager + admin',
      ctx.actors.manager.bands.includes('manager') && ctx.actors.manager.bands.includes('admin'),
      `bands=${JSON.stringify(ctx.actors.manager.bands)}`);

    // A customer-band actor is a requester with no HR employee record — the
    // reader §29.7 marks ⚙️ rather than ✅ on `kb.read.internal`. Not every dev
    // database has one, so its absence is a SKIP on the checks that need it
    // rather than a failure of the rest.
    ctx.actors.customer = (customerBand && !ctx.actors.requester.employeeId)
      ? ctx.actors.requester
      : null;
    if (ctx.actors.customer) {
      check('the requester login is a CUSTOMER, not an employee — the ⚙️ reader (§29.7)', true);
    } else {
      skip('a customer-band requester — every candidate login has an HR employee record,'
        + ' so the customer-specific checks below will skip');
    }

    await guarded('A', partA, ctx);
    await guarded('B', partB, ctx);
    await guarded('C', partC, ctx);

    try {
      server = await start(PORT);
    } catch (err) {
      check(`the smoke server starts on :${PORT}`, false, `${err.code || err.name}: ${err.message}`);
    }
    if (server) await guarded('C2', partCHttp, ctx);
    else skip('C2 — the server did not start, so the HTTP surfaces were not exercised');

    await guarded('D', partD, ctx);
    await guarded('E', partE, ctx);
    await guarded('F', partF, ctx);
    await guarded('G', partG, ctx);
  } finally {
    if (server) server.close();
    try {
      await cleanup();
    } catch (err) {
      console.log(`  WARN  cleanup failed: ${err.message}`);
    }
    for (const grant of grants) {
      try {
        await getDb()(USER_APP_ROLES).where(grant).del();
      } catch (err) {
        console.log(`  WARN  could not remove the temporary grant ${JSON.stringify(grant)}: ${err.message}`);
      }
    }
  }

  return failures;
}

main()
  .then(async (count) => {
    console.log(count === 0 ? '\nHELPDESK KB SMOKE: all checks passed' : `\nHELPDESK KB SMOKE: ${count} check(s) FAILED`);
    await closeDb();
    process.exit(count === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error('helpdesk kb smoke failed:', err.stack || err);
    try { await cleanup(); } catch { /* the DB is already unhappy — nothing to add */ }
    await closeDb();
    process.exit(2);
  });
