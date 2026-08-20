'use strict';

/**
 * InteractionService — the storage half of ERP Core interactions (portal E1).
 *
 * The contract says what an interaction IS and which tables produce one. This
 * knows how to go and get them, which for a timeline means the awkward part:
 * **one subject's history is spread across up to nine tables**, none of which
 * knows about the others.
 *
 * That fan-out is why the service exists rather than each app querying what it
 * happens to know about. Today a CRM screen shows `crm-activity` because that
 * is the table CRM owns; the same customer's emails, campaign events and order
 * chats are in four other tables nobody thought to join. A timeline assembled
 * per-app is a timeline that is wrong in a different way in every app.
 *
 * ── Which tables answer for a subject ─────────────────────────────────────
 *
 * Derived from the contract's own subject declarations rather than listed
 * again here. A source that starts pointing at people is then reachable from a
 * person's timeline without anyone remembering to update a second map — which
 * is exactly the kind of thing nobody remembers.
 *
 * ── Bounded, like PartyService ────────────────────────────────────────────
 *
 * Correct pagination across nine tables ordered by time means reading all of
 * them, so this offers a bounded window instead of a pager that would quietly
 * return wrong pages. A timeline is read from the top; `truncated` says when
 * there is more.
 *
 * READ-ONLY. Interactions are written by the modules that own them — CRM logs
 * its calls, mail logs its messages — and a write path here would be a second
 * way to record an activity, which is the duplication E1 exists to end.
 */

const { documents } = require('../../documents');
const {
  INTERACTION_SOURCES,
  toInteraction,
  sortInteractions,
} = require('@rutba/shared/core/interactions');
const { PARTY_SOURCES } = require('@rutba/shared/core/parties');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function shortSource(uid) {
  return String(uid).replace(/^api::/, '').split('.')[0];
}

/** `person:44` → `{ uid: 'api::person.person', id: '44' }`, or null. */
function parsePartyId(partyId) {
  if (typeof partyId !== 'string') return null;
  const at = partyId.indexOf(':');
  if (at <= 0 || at === partyId.length - 1) return null;
  const short = partyId.slice(0, at);
  const uid = Object.keys(PARTY_SOURCES).find((u) => shortSource(u) === short);
  return uid ? { uid, id: partyId.slice(at + 1) } : null;
}

/**
 * Sources that can hold an interaction against a given subject uid, and the
 * field each uses to point at it. Built from the contract, once.
 */
function sourcesTargeting(subjectUid) {
  const out = [];
  for (const [uid, spec] of Object.entries(INTERACTION_SOURCES)) {
    for (const [field, targetUid] of spec.subject || []) {
      if (targetUid === subjectUid) out.push({ uid, field });
    }
  }
  return out;
}

/** Sources that point at anything, by carrying the record's uid in a column. */
function polymorphicSources() {
  return Object.entries(INTERACTION_SOURCES)
    .filter(([, spec]) => spec.polymorphic)
    .map(([uid]) => uid);
}

/**
 * Relations a source needs populated to project correctly.
 *
 * The subject relation especially: unpopulated it arrives as a bare id, which
 * still yields a subject — but the actor would lose its label, and a timeline
 * of "someone did something" is not worth rendering.
 *
 * EVERY subject candidate is populated, not only the one being filtered on. The
 * projection picks the most specific candidate that resolved, so a query
 * filtered by lead still has to see whether a person is also named — otherwise
 * the same row would report a different subject depending on how it was found.
 */
function populateFor(spec) {
  const populate = {};
  for (const [field] of spec.subject || []) populate[field] = true;
  if (spec.actor) populate[spec.actor] = true;
  return Object.keys(populate).length ? populate : undefined;
}

/**
 * Read one source, projected. A row that will not project is skipped, not fatal.
 *
 * Asks for one row MORE than the caller wants. Without the extra row a
 * single-source timeline can never know it was cut short — the query returns
 * exactly `limit` rows whether or not a hundred more exist behind them, and
 * `truncated` would report false every time. The spare row is dropped after the
 * merge; its only job is to answer "is there more".
 */
async function readSource(uid, { filters, limit }) {
  const spec = INTERACTION_SOURCES[uid];
  if (!spec) return [];
  let rows;
  try {
    rows = await documents(uid).findMany({
      ...(filters ? { filters } : {}),
      populate: populateFor(spec),
      limit: limit + 1,
    });
  } catch {
    // One source failing must not empty a timeline the other eight can fill.
    // A missing table (a module not installed in this instance) is the common
    // case and is not an error worth propagating to a customer screen.
    return [];
  }
  const out = [];
  for (const row of rows) {
    try { out.push(toInteraction(uid, row)); } catch { /* skipped */ }
  }
  return out;
}

/**
 * Everything that ever happened with one party.
 *
 * This is the query the brief is really asking for — "CRM and Support render
 * these as timelines" — and the one no app can answer today.
 */
async function timelineForParty(partyId, options = {}) {
  const parsed = parsePartyId(partyId);
  if (!parsed) return { interactions: [], sources: [], truncated: false };

  const limit = clampLimit(options.limit);
  const targets = sourcesTargeting(parsed.uid);

  const batches = await Promise.all(targets.map(({ uid, field }) =>
    readSource(uid, { filters: { [field]: { id: { $eq: parsed.id } } }, limit })));

  const all = batches.flat();
  const sorted = sortInteractions(all);
  return {
    interactions: sorted.slice(0, limit),
    sources: targets.map((t) => t.uid),
    truncated: all.length > limit,
  };
}

/**
 * Everything that happened to one record, of any kind.
 *
 * Covers both shapes: sources that name this record type through a relation,
 * and the polymorphic ones that carry its uid in a column. A sale order has
 * both — order messages by relation, work-item activity by uid — and a timeline
 * that showed only one half would look complete while missing the other.
 */
async function timelineForRecord(subjectUid, options = {}) {
  if (!subjectUid) return { interactions: [], sources: [], truncated: false };
  const limit = clampLimit(options.limit);
  const { id = null, documentId = null } = options;

  const jobs = [];
  const sources = [];

  for (const { uid, field } of sourcesTargeting(subjectUid)) {
    if (id === null) continue;
    sources.push(uid);
    jobs.push(readSource(uid, { filters: { [field]: { id: { $eq: id } } }, limit }));
  }

  if (documentId) {
    for (const uid of polymorphicSources()) {
      sources.push(uid);
      jobs.push(readSource(uid, {
        filters: { entity_uid: { $eq: subjectUid }, target_document_id: { $eq: documentId } },
        limit,
      }));
    }
  }

  const all = (await Promise.all(jobs)).flat();
  const sorted = sortInteractions(all);
  return {
    interactions: sorted.slice(0, limit),
    sources,
    truncated: all.length > limit,
  };
}

module.exports = {
  MAX_LIMIT,
  parsePartyId,
  sourcesTargeting,
  polymorphicSources,
  timelineForParty,
  timelineForRecord,
};
