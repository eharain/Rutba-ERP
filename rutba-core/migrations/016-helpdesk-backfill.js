'use strict';

/**
 * M5 + M6 + M7 — give every existing contact_tickets row the helpdesk columns
 * it should have had, derived from what is already in the database.
 *
 * This is the risky migration of the set, and the risk is asymmetric. M5 is the
 * ONLY chance to recover reply history: contact-ticket's addReply writes each
 * reply into metadata.latest_reply, overwriting the previous one, so the single
 * surviving fragment per ticket disappears for good the first time the new
 * thread takes over and stops writing there. Everything else here can be
 * recomputed later; that cannot.
 *
 * What runs, in order:
 *   1. count tickets by status — the before half of §8.9's assertion
 *   2. M5  metadata.latest_reply     → a helpdesk_ticket_messages row
 *   3. M6  category                  → desk_id, via each desk's category_map
 *   4. M7  status                    → stage_key (§8.9), changing no status
 *   5.     employee link + constants → requester_kind, source, priority,
 *                                      sla_state, is_imported, reopened_count
 *   6. count by status again and refuse to commit if anything moved
 *
 * Step 6 is not decoration. The migration writes to the same table whose status
 * column the whole module keys on, so it proves it did not touch it rather than
 * asserting it did not. A mismatch throws, the runner's transaction rolls the
 * DML back, and nothing is left half-migrated.
 *
 * IDEMPOTENT. Every write is guarded by "only where the target is still null",
 * and M5 keys each recovered message on a synthetic external_id that the
 * (channel, external_id) unique index would reject a second time anyway.
 *
 * THE OPENING MESSAGE IS DELIBERATELY NOT MATERIALISED. Spec §7.3 keeps
 * contact_tickets.message as the opening body for back-compat, so copying it
 * into the thread would create a second copy of the same text with two writers
 * and no reconciliation — the drift pattern the codebase already knows from
 * denormalised counters. The read model renders the opening from `message` at
 * the head of the thread; only replies, which have nowhere else to live, become
 * rows here.
 *
 * sla_state is backfilled to `indeterminate`, not `ok`. These tickets predate
 * any policy and have no first_response_due_at or resolution_due_at, so calling
 * them compliant would be a claim the data does not support — and it would hide
 * them from M9, the migration whose job is to compute their real targets
 * without retroactively breaching a ticket that was never late.
 */

const crypto = require('crypto');

const TICKETS = 'contact_tickets';
const MESSAGES = 'helpdesk_ticket_messages';
const DESKS = 'helpdesk_desks';
const ASSIGNED_LNK = 'contact_tickets_assigned_to_lnk';
const EMPLOYEE_LNK = 'contact_tickets_employee_lnk';

const LEGACY_CHANNEL = 'legacy';
const FALLBACK_DESK_KEY = 'customer_support';
const BATCH = 500;

// §8.9. `open` is resolved per row (assigned or not), so it is absent here.
const STAGE_BY_STATUS = {
  in_progress: 'working',
  waiting: 'waiting_customer',
  resolved: 'resolved',
  closed: 'closed',
  cancelled: 'cancelled',
  merged: 'merged',
};

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}

async function countByStatus(knex) {
  const rows = await knex(TICKETS).select('status').count('* as total').groupBy('status');
  const out = {};
  for (const row of rows) out[row.status === null ? '<null>' : row.status] = Number(row.total);
  return out;
}

function documentId() {
  // The same 24-char lowercase cuid2 shape the documents() shim generates, and
  // from the same entropy source — a documentId reaches API payloads and URLs,
  // so a predictable one is an enumerable one. Inlined rather than imported
  // because this is the only thing the migration would have needed the shim for.
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(24);
  let out = '';
  for (let i = 0; i < 24; i++) {
    out += alphabet[bytes[i] % (i === 0 ? 26 : 36)];
  }
  return out;
}

/** M5 — every surviving metadata.latest_reply becomes a thread message. */
async function recoverLatestReplies(knex) {
  let scanned = 0;
  let created = 0;
  let alreadyPresent = 0;
  let cursor = 0;

  for (;;) {
    const rows = await knex(TICKETS)
      .whereNotNull('metadata')
      .where('id', '>', cursor)
      .orderBy('id', 'asc')
      .limit(BATCH)
      .select('id', 'metadata', 'last_reply_by', 'last_reply_at', 'created_at', 'updated_at');
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      const metadata = parseJson(row.metadata);
      if (!metadata || typeof metadata !== 'object') continue;
      const body = typeof metadata.latest_reply === 'string' ? metadata.latest_reply.trim() : '';
      if (!body) continue;
      scanned += 1;

      const externalId = `contact-ticket:${row.id}:latest_reply`;
      const existing = await knex(MESSAGES)
        .where({ channel: LEGACY_CHANNEL, external_id: externalId })
        .first('id');
      if (existing) {
        alreadyPresent += 1;
        continue;
      }

      // last_reply_at is the reply's own timestamp; the fallbacks keep the
      // message inside the ticket's lifetime when it was never stamped.
      const at = row.last_reply_at || row.updated_at || row.created_at || new Date();
      await knex(MESSAGES).insert({
        document_id: documentId(),
        ticket_id: row.id,
        body,
        body_format: 'text',
        // Recovered replies were always visible to the requester — the legacy
        // flow had no notion of an internal note, so importing them as internal
        // would hide correspondence the requester has already read.
        visibility: 'public',
        author_id: Number.isInteger(metadata.latest_reply_by_user_id)
          ? metadata.latest_reply_by_user_id
          : null,
        author_kind: row.last_reply_by === 'agent' ? 'agent' : 'requester',
        author_label: null,
        channel: LEGACY_CHANNEL,
        in_reply_to_id: null,
        external_id: externalId,
        delivery_state: null,
        // Unknowable from one surviving fragment, and guessing would corrupt
        // first-response reporting from the first day it is switched on.
        is_first_response: false,
        created_at: at,
        updated_at: at,
      });
      created += 1;
    }
  }

  return { scanned, created, alreadyPresent };
}

/** M6 — desk_id from the legacy category, via each desk's category_map. */
async function backfillDesk(knex) {
  const desks = await knex(DESKS).select('id', 'key', 'category_map');
  if (!desks.length) {
    throw new Error(`${DESKS} is empty — run 015-helpdesk-seed before this migration`);
  }

  const deskByCategory = new Map();
  for (const desk of desks) {
    const categories = parseJson(desk.category_map);
    if (!Array.isArray(categories)) continue;
    for (const category of categories) {
      if (deskByCategory.has(category)) {
        throw new Error(
          `category "${category}" is claimed by more than one desk — a ticket cannot route to two`
        );
      }
      deskByCategory.set(category, desk.id);
    }
  }

  const fallback = desks.find((d) => d.key === FALLBACK_DESK_KEY);
  if (!fallback) throw new Error(`desk "${FALLBACK_DESK_KEY}" is missing — cannot route uncategorised tickets`);

  const present = await knex(TICKETS)
    .whereNull('desk_id')
    .whereNotNull('category')
    .distinct('category')
    .pluck('category');
  const unmapped = present.filter((category) => !deskByCategory.has(category));
  if (unmapped.length) {
    // The M6 failure the spec calls out: an unmapped value would leave those
    // tickets deskless, which is invisible until a queue silently misses them.
    throw new Error(
      `no desk claims category value(s) ${unmapped.map((c) => JSON.stringify(c)).join(', ')}. ` +
      'Add them to a desk\'s category_map (migration 015) and re-run.'
    );
  }

  const byCategory = {};
  for (const [category, deskId] of deskByCategory) {
    const updated = await knex(TICKETS)
      .whereNull('desk_id')
      .where({ category })
      .update({ desk_id: deskId });
    if (updated) byCategory[category] = updated;
  }
  // Rows created before `category` had a default, or written through db.query.
  const uncategorised = await knex(TICKETS)
    .whereNull('desk_id')
    .whereNull('category')
    .update({ desk_id: fallback.id });

  return { byCategory, uncategorised };
}

/** M7 — stage_key from status. No status value is read for writing, ever. */
async function backfillStageKey(knex) {
  const counts = {};

  if (await knex.schema.hasTable(ASSIGNED_LNK)) {
    // "open and someone has picked it up" is triaged; open and untouched is new.
    counts.triaged = await knex(TICKETS)
      .whereNull('stage_key')
      .where('status', 'open')
      .whereIn('id', knex(ASSIGNED_LNK).select('contact_ticket_id'))
      .update({ stage_key: 'triaged' });
  }
  counts.new = await knex(TICKETS)
    .whereNull('stage_key')
    .where('status', 'open')
    .update({ stage_key: 'new' });

  for (const [status, stageKey] of Object.entries(STAGE_BY_STATUS)) {
    const updated = await knex(TICKETS)
      .whereNull('stage_key')
      .where('status', status)
      .update({ stage_key: stageKey });
    if (updated) counts[stageKey] = (counts[stageKey] || 0) + updated;
  }
  return counts;
}

/**
 * The remaining new columns. requester_kind and source are derived rather than
 * defaulted: a ticket with an hr-employee link came through the internal ESS
 * flow, everything else through the storefront — which is the only evidence
 * the old rows carry about where they came from.
 */
async function backfillDerivedDefaults(knex) {
  const out = {};

  if (await knex.schema.hasTable(EMPLOYEE_LNK)) {
    const internal = knex(EMPLOYEE_LNK).select('contact_ticket_id');
    out.requesterKindEmployee = await knex(TICKETS)
      .whereNull('requester_kind')
      .whereIn('id', internal)
      .update({ requester_kind: 'employee' });
    out.sourceInternal = await knex(TICKETS)
      .whereNull('source')
      .whereIn('id', knex(EMPLOYEE_LNK).select('contact_ticket_id'))
      .update({ source: 'internal' });
  }
  out.requesterKindCustomer = await knex(TICKETS)
    .whereNull('requester_kind')
    .update({ requester_kind: 'customer' });
  out.sourceWeb = await knex(TICKETS).whereNull('source').update({ source: 'web' });

  out.priority = await knex(TICKETS).whereNull('priority').update({ priority: 'normal' });
  out.slaState = await knex(TICKETS).whereNull('sla_state').update({ sla_state: 'indeterminate' });
  out.isImported = await knex(TICKETS).whereNull('is_imported').update({ is_imported: false });
  out.reopenedCount = await knex(TICKETS).whereNull('reopened_count').update({ reopened_count: 0 });
  return out;
}

module.exports = {
  name: '016-helpdesk-backfill',

  async up(knex) {
    if (!(await knex.schema.hasTable(MESSAGES))) {
      throw new Error(`${MESSAGES} is missing — run 012 before this migration`);
    }

    const before = await countByStatus(knex);

    const replies = await recoverLatestReplies(knex);
    const desks = await backfillDesk(knex);
    const stages = await backfillStageKey(knex);
    const derived = await backfillDerivedDefaults(knex);

    const after = await countByStatus(knex);
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const moved = keys.filter((k) => (before[k] || 0) !== (after[k] || 0));
    if (moved.length) {
      throw new Error(
        'refusing to commit: the status distribution changed during a backfill that must not ' +
        `touch status — ${moved.map((k) => `${k} ${before[k] || 0}→${after[k] || 0}`).join(', ')}`
      );
    }

    console.log(
      `[migrate] M5 replies: ${replies.scanned} candidate(s), ${replies.created} recovered, ` +
      `${replies.alreadyPresent} already present`
    );
    console.log(
      '[migrate] M6 desks: ' +
      (Object.entries(desks.byCategory).map(([c, n]) => `${c}=${n}`).join(', ') || 'none') +
      `, uncategorised→${FALLBACK_DESK_KEY}=${desks.uncategorised}`
    );
    console.log(
      '[migrate] M7 stages: ' +
      (Object.entries(stages).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(', ') || 'none')
    );
    console.log(
      '[migrate] derived: ' +
      Object.entries(derived).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(', ')
    );
    console.log(
      `[migrate] status distribution unchanged across ${keys.length} value(s): ` +
      keys.map((k) => `${k}=${after[k] || 0}`).join(', ')
    );
  },

  // One-way. Rolling this back would delete the recovered replies, and those
  // rows are the only remaining copy of that text — metadata.latest_reply held
  // one reply per ticket and the thread is what replaced it. desk_id and
  // stage_key are cheap to recompute by re-running forward; the messages are
  // not. Roll back 012 instead if the tables themselves must go.
  down: null,
};
