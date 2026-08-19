'use strict';

/**
 * PartyService — the storage half of ERP Core parties (portal task E1).
 *
 * `@rutba/shared/core/parties` is the contract: pure, no database, no HTTP, so
 * the same normalisation runs in a Next app and here. This file is the only
 * part that knows the five tables party data currently lives in, and its whole
 * job is to hand rows to that contract and give back parties.
 *
 * Keeping the split exactly there is the point. When the unification collapses
 * five tables into one, the contract does not change and neither does anything
 * that consumed it — only the queries below.
 *
 * THIS SERVICE IS READ-ONLY, ON PURPOSE. Writes stay with the owning module:
 * POS creates customers, purchasing creates suppliers, HR creates employees. A
 * write path here would have to decide which of the five a new party lands in,
 * and that decision belongs to the unification. Adding one now would just be a
 * sixth way to make a customer.
 *
 * ── Search, not a paginated list ──────────────────────────────────────────
 *
 * There is no parties table, so "page 3 of all parties by name" means paging
 * five tables in lockstep and merging, which cannot be done correctly without
 * reading all of them. Rather than ship a pager that quietly returns wrong
 * pages, this offers bounded search: a cap, no offset, and `truncated` when the
 * cap bit. That is also what the actual consumer wants — every module needs
 * "find the party matching what the user typed", and a picker wants the top N.
 *
 * Real pagination arrives with the unified table, and this note goes with it.
 *
 * ── One packaging note ────────────────────────────────────────────────────
 *
 * The contract is ESM and this file is CommonJS, so the require() below leans
 * on Node's require(esm), which is on by default from 22.12. package.json
 * already demands node >=22 and the image is node:22-alpine, so this holds —
 * but it is the first time core requires a workspace package rather than
 * reading a JSON out of one, so it is worth knowing that is the mechanism if it
 * ever fails on an older runtime. The fix would be a .cjs build of the
 * contract, not a second copy of it here.
 */

const { documents } = require('../../documents');
const {
  PARTY_SOURCES,
  toParty,
  groupParties,
} = require('@rutba/shared/core/parties');

const SOURCE_UIDS = Object.freeze(Object.keys(PARTY_SOURCES));

/**
 * Relations the contract reads to build `links`, per source. Without these
 * populated, `toParty` sees undefined and every party looks unlinked — which
 * would silently turn the strongest match key (an explicit `person` relation)
 * into no key at all.
 */
const POPULATE = Object.freeze({
  'api::person.person': { user: true, merged_into: true },
  'api::crm-contact.crm-contact': { person: true },
  'api::hr-employee.hr-employee': { user: true },
});

/**
 * Fields free-text search looks at. All five sources carry name/email/phone;
 * only `supplier` has `contact_person`, and it is worth searching because
 * "which supplier does Sara work at" is how staff actually look one up.
 *
 * Filtering on a column a table does not have is a query error, not an empty
 * result, so this is per-source rather than one list.
 */
const SEARCH_FIELDS = Object.freeze({
  'api::supplier.supplier': ['name', 'contact_person', 'email', 'phone'],
});
const DEFAULT_SEARCH_FIELDS = Object.freeze(['name', 'email', 'phone']);

/** `api::hr-employee.hr-employee` → `hr-employee`, matching the contract's ids. */
function shortSource(uid) {
  return String(uid).replace(/^api::/, '').split('.')[0];
}

const UID_BY_SHORT = Object.freeze(
  Object.fromEntries(SOURCE_UIDS.map((uid) => [shortSource(uid), uid]))
);

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
/**
 * Ceiling for the dedup sweep, which reads whole tables rather than a page.
 * Measured 2026-08-20 the five sources hold 145 rows in total, so this is
 * headroom rather than a constraint — but it is a real cap, and `truncated`
 * says when it bit rather than letting a partial sweep read as a clean one.
 */
const SWEEP_LIMIT = 2000;

function clampLimit(value, max = MAX_LIMIT) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, max);
}

function searchFilter(uid, term) {
  if (!term) return undefined;
  const fields = SEARCH_FIELDS[uid] || DEFAULT_SEARCH_FIELDS;
  return { $or: fields.map((f) => ({ [f]: { $containsi: term } })) };
}

/** Read one source and project it. Rows that will not project are dropped. */
async function readSource(uid, { filters, limit, sort = 'name:asc' } = {}) {
  if (!PARTY_SOURCES[uid]) return [];
  const rows = await documents(uid).findMany({
    ...(filters ? { filters } : {}),
    populate: POPULATE[uid],
    sort,
    limit,
  });
  const out = [];
  for (const row of rows) {
    // toParty throws on a row it cannot make sense of. One malformed row must
    // not empty a picker, so it is skipped and the rest are returned.
    try { out.push(toParty(uid, row)); } catch { /* skipped */ }
  }
  return out;
}

/**
 * Which sources answer for which roles.
 *
 * An unrecognised role narrows to nothing rather than widening to everything: a
 * typo must not quietly return the whole address book.
 */
function uidsForRoles(roles) {
  if (!roles || !roles.length) return SOURCE_UIDS;
  const wanted = new Set(roles);
  return SOURCE_UIDS.filter((uid) => wanted.has(PARTY_SOURCES[uid].role));
}

/**
 * Sort merged results as one list.
 *
 * Ties are the NORMAL case here, not an edge one: the same human sitting in the
 * customer table and the person table has the same name by construction. Falling
 * through to the id keeps the order stable whichever source answered first, so a
 * picker does not reshuffle between identical requests.
 *
 * Nameless parties sink rather than lead — a party with no name is real data
 * (POS writes phone-only walk-ins) but it is never what someone searched for.
 */
function byName(a, b) {
  if (!a.displayName && !b.displayName) return a.id.localeCompare(b.id);
  if (!a.displayName) return 1;
  if (!b.displayName) return -1;
  const cmp = a.displayName.localeCompare(b.displayName);
  return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
}

/**
 * One party by its contract id (`customer:12`, `hr-employee:3`).
 *
 * The id is the numeric primary key, not a documentId — three of the five
 * sources predate documentIds here and are addressed by id everywhere else.
 */
async function getById(partyId) {
  if (typeof partyId !== 'string') return null;
  const at = partyId.indexOf(':');
  if (at <= 0 || at === partyId.length - 1) return null;
  const uid = UID_BY_SHORT[partyId.slice(0, at)];
  if (!uid) return null;
  const [party] = await readSource(uid, {
    filters: { id: { $eq: partyId.slice(at + 1) } },
    limit: 1,
  });
  return party || null;
}

/**
 * Bounded search across party sources — see the module note on why this is not
 * a paginated list.
 *
 * Each source is asked for the full limit rather than a share of it: splitting
 * the budget five ways would hide the supplier someone is looking for behind
 * four customers with similar names. The merged list is then truncated, so the
 * cap still holds.
 *
 * @param {object}    options
 * @param {string}   [options.q]     free text over name/email/phone
 * @param {string[]} [options.roles] customer | supplier | employee | contact | lead
 * @param {number}   [options.limit] capped at MAX_LIMIT
 */
async function search(options = {}) {
  const limit = clampLimit(options.limit);
  const term = typeof options.q === 'string' ? options.q.trim() : '';
  const uids = uidsForRoles(options.roles);

  const batches = await Promise.all(
    uids.map((uid) => readSource(uid, { filters: searchFilter(uid, term), limit }))
  );

  const all = batches.flat().sort(byName);
  return {
    parties: all.slice(0, limit),
    truncated: all.length > limit,
    sources: uids,
  };
}

/**
 * Propose parties that are probably the same one, across all five sources.
 *
 * The grouping itself is the contract's `groupParties` — union-find over strong
 * keys only, so a shared name never merges anything by itself. Reusing it rather
 * than writing a second matcher here is deliberate: two implementations of
 * "is this the same person" would disagree eventually, and the one that
 * disagreed silently would be this one.
 *
 * It PROPOSES. Nothing is merged, because `person.merged_into` and the
 * `person-dedup-audit` table already make merging a decision with a record, and
 * a convenience merge here would bypass that record.
 */
async function duplicates(options = {}) {
  const limit = clampLimit(options.limit, SWEEP_LIMIT);
  const batches = await Promise.all(
    SOURCE_UIDS.map((uid) => readSource(uid, { limit }))
  );
  const parties = batches.flat();
  const truncated = batches.some((b) => b.length >= limit);
  const { groups, singletons } = groupParties(parties);
  return {
    groups,
    scanned: parties.length,
    unmatched: singletons.length,
    // A partial sweep must never read as a clean one: the groups below are only
    // complete if every source was read to the end.
    truncated,
  };
}

module.exports = {
  SOURCE_UIDS,
  UID_BY_SHORT,
  MAX_LIMIT,
  SWEEP_LIMIT,
  getById,
  search,
  duplicates,
};
