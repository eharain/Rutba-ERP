'use strict';

/**
 * The knowledge base's authorization gate (spec 11 §11.3, §11.9; spec 29
 * §29.7).
 *
 * WHY THE KB HAS ITS OWN GATE INSTEAD OF ROWS IN entitlement.js. That file
 * computes one thing:
 *
 *     role capability  ∩  desk scope  ∩  branch scope  ∩  ownership
 *
 * Three of those four terms do not exist for an article. The KB is
 * tenant-scoped and desk-TAGGED, not desk-owned (§11.2) — one "how to reset
 * your password" article serves the IT desk and the customer portal at once, so
 * desk membership cannot decide who reads it. An article has no branch and no
 * requester, so branch scope and ownership have nothing to bind to. Adding KB
 * rows to a MATRIX whose scope vocabulary is `desk`/`own`/`setting` would mean
 * teaching a ticket gate three KB-shaped concepts it will never use again, and
 * the result would read as though desk scope applied when it does not.
 *
 * So this file is to articles what entitlement.js is to tickets: the ONE place
 * that decides, reached through the same door (`hasBand`, `ForbiddenError`), so
 * a cron, an event handler, an HTTP request and the future AI grounding call
 * all arrive at the same answer.
 *
 * THREE TIERS, NOT A BOOLEAN (§11.3):
 *
 *   public      anyone, INCLUDING anonymous
 *   internal    any authenticated reader — employees, and account-holding
 *               customers where the category admits them (the ⚙️ in §29.7)
 *   agent_only  helpdesk staff bands only, for internal procedures ("how to
 *               process a chargeback") that must never reach a requester
 *
 * The third tier is the entire reason visibility is not a boolean, and the
 * acceptance criterion it exists for is absolute: an `agent_only` article never
 * appears in requester search, in suggestions, in the portal, on the public
 * pages, or in an AI answer. That guarantee is deliberately the SIMPLEST thing
 * in this file — `visibleTiers()` returns a list, the repository puts it in a
 * `whereIn`, and there is no code path that reads an article without one. The
 * customer/category nuance below is layered on top as a NARROWING and can only
 * ever remove rows from that list.
 *
 * SYNCHRONOUS AND PURE, for the same reason entitlement.can() is: an async gate
 * is a gate somebody eventually forgets to await, and `if (canRead(...))` on a
 * pending Promise is always true. Everything these functions need has already
 * been resolved onto the actor by entitlement.resolveActor().
 *
 * FAIL CLOSED. An unknown capability, an unknown tier, an article with a
 * visibility value nothing recognises — all deny.
 */

const { hasBand, ForbiddenError } = require('./entitlement');

/** Article tiers, most open first. Order is meaningful — see visibleTiers(). */
const TIERS = Object.freeze(['public', 'internal', 'agent_only']);

/** Category tiers (§11.3): which tree a category appears in. */
const CATEGORY_VISIBILITIES = Object.freeze(['public', 'internal', 'both']);

const STATUSES = Object.freeze(['draft', 'in_review', 'published', 'archived']);

/**
 * Spec 29 §29.7 as data. Values are BAND LISTS: the capability exists for these
 * bands and for nobody else.
 *
 * `system` appears on the read capabilities and on nothing else. The staleness
 * sweep has to see every tier to decide what is stale, and the AI grounding
 * retrieval runs as a machine actor on behalf of a human whose own tier list is
 * applied separately (§22.5 — retrieve only what the ASKING agent may read).
 * It appears on no WRITE capability: a machine may not publish a public
 * statement by the business, which is the same reason §11.4 puts publishing
 * behind a manager.
 *
 * `approver` is absent everywhere except the two open tiers. §29.7 has no Apr
 * column at all, and an approver is not a helpdesk author — omission here is
 * the deny, and it is deliberate rather than an oversight.
 */
const CAPABILITIES = Object.freeze({
  'kb.read.public': ['admin', 'manager', 'agent', 'approver', 'system', 'requester'],
  'kb.read.internal': ['admin', 'manager', 'agent', 'approver', 'system', 'requester'],
  'kb.read.agent_only': ['admin', 'manager', 'agent', 'system'],
  'kb.author': ['admin', 'manager', 'agent'],
  'kb.review': ['admin', 'manager'],
  'kb.publish': ['admin', 'manager'],
  'kb.archive': ['admin', 'manager'],
  'kb.configure': ['admin'],
});

/** The tier → capability mapping, so there is one name for one decision. */
const READ_CAPABILITY = Object.freeze({
  public: 'kb.read.public',
  internal: 'kb.read.internal',
  agent_only: 'kb.read.agent_only',
});

const STAFF_BANDS = Object.freeze(['admin', 'manager', 'agent']);

/**
 * Capabilities a signed-out caller can never hold, however the bands read.
 *
 * THIS SET EXISTS BECAUSE THE BAND LIST ALONE IS NOT ENOUGH, and the reason is
 * a trap worth naming. Every actor carries the `requester` band — that is how
 * entitlement.js lets a customer reach their own ticket without holding a role
 * (§4.6) — and an ANONYMOUS caller is resolved to a guest actor carrying
 * exactly that band and nothing else. So `kb.read.internal`, which legitimately
 * lists `requester` for account-holding customers, would match a guest too, and
 * every `internal` article in the tenant would be served on the public help
 * pages to anyone who asked.
 *
 * `internal` means "authenticated" first and "customer or employee" second
 * (§11.3). Being signed in is the whole distinction, so it is checked before
 * the bands rather than expressed through them.
 *
 * The write capabilities are listed too. A guest cannot hold a staff band, so
 * they are already unreachable — they are here because a set called
 * AUTHENTICATED_ONLY that quietly omitted "publish" would be read as a claim
 * that publishing is not.
 */
const AUTHENTICATED_ONLY = Object.freeze(new Set([
  'kb.read.internal', 'kb.author', 'kb.review', 'kb.publish', 'kb.archive', 'kb.configure',
]));

/**
 * A machine actor: the cron sweep, an event handler, AI grounding. Carries the
 * `system` band and never an id.
 */
function isMachine(actor) {
  return hasBand(actor, 'system');
}

/**
 * Nobody is signed in. NOT simply `!actor.id` — the system actor also has a
 * null id, and treating a cron as anonymous would deny the staleness sweep the
 * reads it exists to perform.
 *
 * This is the single most consequential predicate in the file: `internal`
 * hangs off it, and a guest that tested as authenticated would open every
 * internal article on the public help pages.
 */
function isAnonymous(actor) {
  if (!actor) return true;
  if (isMachine(actor)) return false;
  return !actor.id;
}

/** Helpdesk staff, in the §29.7 sense of the Adm / Mgr / Agt columns. */
function isStaff(actor) {
  return STAFF_BANDS.some((band) => hasBand(actor, band));
}

/**
 * An employee reader (§29.7's Emp column) rather than a customer (Cus). The
 * same distinction desk.service.js draws for requester-visible desks, drawn the
 * same way, from the HR link entitlement.resolveActor already resolved.
 */
function isEmployee(actor) {
  return Boolean(actor && actor.employeeId);
}

/** Capability check by name (§11.9). Unknown capability → deny. */
function can(actor, capability) {
  const bands = CAPABILITIES[capability];
  if (!bands) return false;
  // Before the bands, never after — see AUTHENTICATED_ONLY.
  if (AUTHENTICATED_ONLY.has(capability) && isAnonymous(actor)) return false;
  return bands.some((band) => hasBand(actor, band));
}

function assertCan(actor, capability) {
  if (can(actor, capability)) return true;
  throw new ForbiddenError(`Not permitted: helpdesk.${capability}`);
}

/**
 * The tiers this actor may read, as a list the repository pushes straight into
 * a `whereIn`. Never a post-filter: a tier filtered after the fetch still leaks
 * through result counts, pagination totals and ranking positions (§26.4), and
 * one caller that forgets it is a disclosure.
 *
 * Returns tiers in TIERS order so the array is stable and comparable in tests.
 */
function visibleTiers(actor) {
  return TIERS.filter((tier) => can(actor, READ_CAPABILITY[tier]));
}

/**
 * Does this actor's access to `internal` depend on the article's category?
 *
 * §29.7 marks `kb.read.internal` ✅ for employees and ⚙️ for customers —
 * "customers-with-accounts as configured per category" (§11.3). The delivered
 * configuration for that is KbCategory.visibility: a category the tenant marked
 * `internal` is a staff-and-employee tree, and its articles are not offered to
 * a customer even when the customer is signed in.
 *
 * Staff, employees and machine actors are never narrowed. An uncategorised
 * article has no configuration to consult and stays readable, which is the
 * documented default rather than an accident — see assertCategoryAdmits.
 */
function internalNeedsCategoryOptIn(actor) {
  if (!actor) return true;
  if (isStaff(actor) || isMachine(actor) || isEmployee(actor)) return false;
  return true;
}

/** Category tiers that are shown on the requester surface. */
function categoryAdmitsCustomers(category) {
  if (!category) return true;
  const visibility = category.visibility || 'both';
  return visibility === 'public' || visibility === 'both';
}

/**
 * The row-level answer, for a single article the caller has already loaded.
 * `category` may be null — either because the article is uncategorised or
 * because the caller did not join it — and the two are indistinguishable here
 * ON PURPOSE: a caller that cannot supply the category must not silently get a
 * looser answer than the query would have given, so it gets the same one the
 * uncategorised case gets.
 *
 * Callers that need the strict answer read through the repository, where the
 * category is part of the query and cannot be omitted.
 */
function canReadArticle(actor, article, category = null) {
  if (!article) return false;
  const tier = article.visibility;
  if (!TIERS.includes(tier)) return false;
  if (!can(actor, READ_CAPABILITY[tier])) return false;
  if (tier === 'internal' && internalNeedsCategoryOptIn(actor)) {
    return categoryAdmitsCustomers(category);
  }
  return true;
}

/**
 * Spec 27.8: a record the caller cannot see is ABSENT, not forbidden. A 403 on
 * an article confirms it exists, which turns the slug space into an enumeration
 * oracle over internal procedure names — and "how to process a chargeback"
 * leaks something merely by being a title somebody guessed correctly.
 *
 * So this throws NotFoundError, never ForbiddenError. The write capabilities
 * above are the opposite case and correctly throw Forbidden: the caller can
 * already see the article, they simply may not publish it.
 */
class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; }
}

function assertCanReadArticle(actor, article, category = null) {
  if (canReadArticle(actor, article, category)) return true;
  throw new NotFoundError('Not Found');
}

/**
 * Which statuses this actor may see. Drafts and in-review articles are
 * invisible to requesters (§11 acceptance criterion 2) — an unfinished answer
 * is worse than no answer, and an in-review one has by definition not been
 * vouched for.
 *
 * Archived is excluded for everyone by default: an archived article is
 * withdrawn, and a reader who reaches one has been given a wrong answer with a
 * publication date on it. Staff opt back in explicitly to manage them.
 */
function visibleStatuses(actor, { includeArchived = false } = {}) {
  if (!can(actor, 'kb.author') && !isMachine(actor)) return ['published'];
  const statuses = ['draft', 'in_review', 'published'];
  if (includeArchived) statuses.push('archived');
  return statuses;
}

/**
 * The read scope, resolved once and handed to the repository whole. One object
 * rather than three arguments so a caller cannot pass the tiers and forget the
 * statuses — the two together ARE the answer to "what may this reader see", and
 * splitting them is how half of one gets applied.
 */
function readScope(actor, options = {}) {
  return {
    tiers: visibleTiers(actor),
    statuses: visibleStatuses(actor, options),
    // Narrowing only — see internalNeedsCategoryOptIn.
    internalRequiresOpenCategory: internalNeedsCategoryOptIn(actor),
  };
}

/**
 * The audience label stamped on feedback and zero-result rows, so a
 * helpfulness ratio or a content gap can be read per surface instead of as one
 * blended number that describes nobody.
 */
function surfaceFor(actor) {
  if (isStaff(actor)) return 'agent';
  if (isAnonymous(actor)) return 'public';
  return 'portal';
}

module.exports = {
  TIERS,
  CATEGORY_VISIBILITIES,
  STATUSES,
  CAPABILITIES,
  AUTHENTICATED_ONLY,
  READ_CAPABILITY,
  can,
  assertCan,
  canReadArticle,
  assertCanReadArticle,
  visibleTiers,
  visibleStatuses,
  readScope,
  internalNeedsCategoryOptIn,
  categoryAdmitsCustomers,
  isAnonymous,
  isStaff,
  isEmployee,
  isMachine,
  surfaceFor,
  NotFoundError,
  ForbiddenError,
};
