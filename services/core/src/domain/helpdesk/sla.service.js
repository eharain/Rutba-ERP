'use strict';

/**
 * SLAService — the two clocks, the promise they measure, and the sweep that
 * reports honestly when it is broken (spec 12).
 *
 * What existed before this file was a single `sla_due_at` set from a
 * caller-supplied `sla_hours` on the public submit route, and an endpoint on
 * which a CLIENT told the server it had breached. Nothing measured anything.
 * Here the desk makes a promise it can be held to: targets per priority, a
 * calendar that says what an hour of "business time" means, a clock that stops
 * when the desk is genuinely blocked, and a sweep that flags — and only flags.
 *
 * THE TWO CLOCKS (§12.3) ARE NOT SYMMETRIC, and every rule below follows from
 * that asymmetry:
 *
 *   First response  created → first PUBLIC agent message. Stamped once by
 *                   stampFirstResponse and NEVER recomputed, not on reopen, not
 *                   by a recompute, not by an admin (RULE-18). It NEVER PAUSES:
 *                   you cannot claim credit for not having replied yet because
 *                   you are waiting for the person you have not replied to.
 *   Resolution      created → status reaches `resolved`. Restarts on reopen and
 *                   pauses per policy.
 *
 * WHY `sla_state` IS MATERIALISED ON THE TICKET. "Show me what is breaching" is
 * the most-run query on any desk (spec 35 §35.4 Q2). Computing it per row at
 * query time makes that query a full scan with a calendar conversion per ticket;
 * storing it makes it an indexed lookup on contact_tickets_sla_state_idx. This
 * is the single highest-value denormalisation in the module, and the sweep is
 * what keeps it true.
 *
 * STATE PRECEDENCE: breached > at_risk > paused > ok. `paused` describes the
 * RESOLUTION clock only. A ticket parked on the customer whose first response is
 * overdue is breached, not paused — a queue filtering `sla_state = 'breached'`
 * that quietly omitted paused tickets would be exactly the blind spot the
 * materialisation exists to remove.
 *
 * WHILE PAUSED, THE RESOLUTION CLOCK IS EVALUATED AS OF `sla_paused_at`, not
 * now. The due-at is only pushed out on resume, so measuring a paused ticket
 * against the wall clock would walk it into a false breach during the pause and
 * then un-breach it the moment somebody replied. Freezing the reference instant
 * is what makes pause/resume arithmetic reversible.
 *
 * BREACH IS A TIMESTAMP COMPARISON, ON PURPOSE. `now >= due_at` needs no
 * calendar, which is what lets the sweep's candidate query use an index and what
 * lets a queue sort by `resolution_due_at`. Business time is paid for once, when
 * the due-at is computed; only the at-risk threshold and the overrun percentage
 * re-enter the calendar, and only for tickets that are already candidates.
 *
 * NO RETROACTIVE BREACH (F5). A policy edit must never turn a compliant ticket
 * into a breached one after the fact. recomputeFor therefore refuses to move a
 * due-at that is still in the future to an instant already in the past, and
 * refuses to silently revoke an audited manual extension. The promise a ticket
 * was given is the promise it is judged against; the new one applies to the next
 * ticket. Every target change is recorded as an event, so the original remains
 * reportable.
 *
 * THE SWEEP FLAGS ONLY (RULE-9). It writes SLA columns, emits events and stops.
 * It never transitions, never resolves, never closes, never approves, under any
 * configuration — structurally, because it contains no code that writes
 * `status`. Escalation actions that DO mutate a ticket (raise priority,
 * reassign) are emitted as `helpdesk.sla.escalated` and executed by a subscriber
 * through TicketService, where they are gated and audited like any other
 * mutation. SLAService performs none of them itself.
 *
 * DEDUPE USES THE OUTBOX AS THE LEDGER. "One breach event per ticket per
 * milestone, never one per sweep" needs a record of what has already been
 * announced, and core_events is exactly that record — persistent, transactional
 * and restart-safe, so a missed run catches up rather than losing a breach and a
 * repeated run announces nothing twice. The announcement key includes the
 * due-at, so a due-at that legitimately moves (an extension, a resume push-out,
 * a reopen restart) re-arms the milestone: a second breach after an extension is
 * news, not a duplicate. KNOWN INTERACTION: event retention
 * (RUTBA_CORE_EVENTS_RETENTION_DAYS, 90 by default) purges delivered events, so
 * a ticket still open more than that long after breaching re-announces once per
 * retention period. Bounded, visible, and preferable to a second ledger table.
 *
 * WRITES DO NOT BUMP `updated_at`. sla_state is derived: a sweep pass that
 * touched it would reorder every agent's "recently updated" queue and put a
 * machine's bookkeeping where a human's edit should be. contact_tickets is
 * written through knex here rather than documents() for the same reason — these
 * are denormals, not document edits.
 *
 * IMPORTED TICKETS ARE NEVER MEASURED (F12, §12.12). Their created_at is
 * historical, so computing a target from it would breach them on arrival and
 * poison every compliance figure. They are marked `indeterminate` and the sweep
 * does not select them.
 *
 * MULTI-INSTANCE LEADERSHIP IS AN UNSOLVED PLATFORM GAP. The sweep is
 * registered through registerCron and therefore gated by RUTBA_CORE_CRONS=1,
 * which is documented as leader-only — but nothing enforces that. Two instances
 * with the flag set both sweep, and while the state writes are idempotent and
 * the announcement check is a read-then-write with no lock, the window between
 * them is real: the same breach can be announced twice. Closing it needs an
 * explicit lease (spec 12.8, spec 28.10), not a shorter interval.
 *
 * Requiring this file registers the cron; nothing runs until startCrons() and
 * only when RUTBA_CORE_CRONS=1.
 *
 * Env knobs (all optional):
 *   RUTBA_CORE_HELPDESK_SLA_RULE          cron rule            every 15 minutes
 *   RUTBA_CORE_HELPDESK_SLA_BATCH         tickets per batch                 500
 *   RUTBA_CORE_HELPDESK_SLA_MAX_BATCHES   batches per pass                  200
 *   RUTBA_CORE_HELPDESK_SLA_CACHE_MS      config cache TTL                30000
 */

const { getDb, withTransaction } = require('../../db/connection');
const { documents } = require('../../documents');
const { registerCron } = require('../../platform/cron');
const { emit, EVENTS_TABLE } = require('../../platform/events');
const { get } = require('../../config/env');
const workflowService = require('../../platform/workflow');
const businessTime = require('./business-time');
const entitlement = require('./policy/entitlement');

const TICKET_UID = 'api::contact-ticket.contact-ticket';
const ACTIVITY_UID = 'api::work-item-activity.work-item-activity';

const TICKETS = 'contact_tickets';
const DESKS = 'helpdesk_desks';
const POLICIES = 'helpdesk_sla_policies';
const TARGETS = 'helpdesk_sla_targets';
const CALENDARS = 'helpdesk_business_calendars';
const HOLIDAYS = 'helpdesk_holidays';
// Spec §10 builds this; migration 014 deliberately did not ship it. The first
// step of §12.4's resolution order is skipped until it exists.
const CATALOG_ITEMS = 'helpdesk_catalog_items';

const SWEEP_CRON = 'helpdeskSlaSweep';

const STATE = {
  OK: 'ok',
  AT_RISK: 'at_risk',
  BREACHED: 'breached',
  PAUSED: 'paused',
  INDETERMINATE: 'indeterminate',
};

const CLOCK = { FIRST_RESPONSE: 'first_response', RESOLUTION: 'resolution' };

const EVENTS = {
  AT_RISK: 'helpdesk.sla.at_risk',
  BREACHED: 'helpdesk.sla.breached',
  PAUSED: 'helpdesk.sla.paused',
  RESUMED: 'helpdesk.sla.resumed',
  ESCALATED: 'helpdesk.sla.escalated',
  // Not in §12.11's list. §12.10 requires the admin recompute and the manual
  // extension to be audited, and an event that commits with the change it
  // describes is the only audit record that cannot be lost.
  EXTENDED: 'helpdesk.sla.extended',
  RECOMPUTED: 'helpdesk.sla.recomputed',
};

const ANNOUNCED_EVENT_NAMES = [EVENTS.AT_RISK, EVENTS.BREACHED, EVENTS.ESCALATED];

// The resolution clock stops here. `resolved` is included even though it is not
// a terminal stage: the promise was to resolve, and it has been kept.
const CLOCK_STOPPING_STATUSES = ['resolved', 'closed', 'cancelled', 'merged'];

// §12.9. `notify` is inert here by construction; `priority` and `reassign`
// mutate a ticket and are therefore emitted for TicketService to perform. No
// action that resolves, closes or approves is accepted — an escalation ladder is
// never allowed to finish a ticket on the desk's behalf.
const ESCALATION_ACTIONS = new Set(['notify', 'priority', 'reassign']);

const MINUTE_MS = 60 * 1000;
const MAX_REASON_CHARS = 500;

const TICKET_COLUMNS = [
  'id', 'document_id', 'status', 'priority', 'desk_id', 'team_id', 'branch_id',
  'catalog_item_id', 'sla_policy_id', 'workflow_id', 'stage_key',
  'first_response_due_at', 'first_response_at', 'resolution_due_at',
  'sla_state', 'sla_paused_at', 'sla_paused_ms', 'sla_due_at',
  'resolved_at', 'closed_at', 'reopened_count', 'is_imported', 'archived_at',
  'created_at', 'updated_at',
];

class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}
class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; }
}

const { ForbiddenError } = entitlement;

function warn(message) {
  const log = global.strapi && global.strapi.log;
  if (log && typeof log.warn === 'function') log.warn(`[helpdesk-sla] ${message}`);
  else console.warn(`[helpdesk-sla] ${message}`);
}

function intEnv(name, fallback) {
  const raw = parseInt(get(name, ''), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function truthy(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return ['1', 'true', 'yes', 'y'].includes(String(value).trim().toLowerCase());
}

function toDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** BIGINT arrives as a string from both mysql2 and pg. */
function toNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nowFrom(options) {
  return toDate(options && options.now) || new Date();
}

function sameInstant(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

// ── configuration cache ───────────────────────────────────────────────────
//
// Desks, policies and calendars are edited a few times a year and read once per
// ticket per sweep. Per-process with a short TTL, exactly like the workflow
// service: invalidate() only clears the process that handled the write, so a
// clustered deployment picks an edit up within the TTL. Closing that gap needs
// a real invalidation channel, not a shorter TTL.

const caches = { policy: new Map(), calendar: new Map(), desk: new Map(), misc: new Map() };

function cacheTtlMs() {
  return intEnv('RUTBA_CORE_HELPDESK_SLA_CACHE_MS', 30000);
}

async function cached(bucket, key, loader) {
  const store = caches[bucket];
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < cacheTtlMs()) return hit.value;
  const value = await loader();
  store.set(key, { at: Date.now(), value });
  return value;
}

/** Drop cached configuration. Call from the policy/calendar/desk write paths. */
function invalidate() {
  for (const store of Object.values(caches)) store.clear();
}

async function hasTable(name) {
  return cached('misc', `table:${name}`, () => getDb().schema.hasTable(name));
}

// ── loading ───────────────────────────────────────────────────────────────

/**
 * A policy plus its targets, keyed by priority. Targets are loaded with the
 * policy rather than per ticket because a sweep evaluates one policy against
 * hundreds of tickets and the target set is four rows.
 */
async function loadPolicy(policyId) {
  if (!policyId) return null;
  return cached('policy', `id:${policyId}`, async () => {
    const row = await getDb()(POLICIES).where('id', policyId).first();
    if (!row) return null;
    return { ...row, targets: await loadTargets(row.id) };
  });
}

async function loadTargets(policyId) {
  const rows = await getDb()(TARGETS).where('policy_id', policyId).select();
  const byPriority = {};
  for (const row of rows) {
    byPriority[String(row.priority)] = {
      id: row.id,
      priority: row.priority,
      first_response_ms: row.first_response_minutes === null || row.first_response_minutes === undefined
        ? null
        : toNumber(row.first_response_minutes) * MINUTE_MS,
      resolution_ms: row.resolution_minutes === null || row.resolution_minutes === undefined
        ? null
        : toNumber(row.resolution_minutes) * MINUTE_MS,
      at_risk_threshold_pct: toNumber(row.at_risk_threshold_pct, 80),
      escalation_steps: normalizeSteps(row.escalation_steps),
    };
  }
  return byPriority;
}

async function loadDefaultPolicy() {
  return cached('policy', 'default', async () => {
    const row = await getDb()(POLICIES)
      .where('is_default', true)
      .where('is_active', true)
      .orderBy('id', 'asc')
      .first();
    if (!row) return null;
    return { ...row, targets: await loadTargets(row.id) };
  });
}

async function loadDesk(deskId) {
  if (!deskId) return null;
  return cached('desk', `id:${deskId}`, async () => {
    const row = await getDb()(DESKS).where('id', deskId).first();
    return row || null;
  });
}

/**
 * A calendar in the shape business-time wants: the row plus its holidays. The
 * normalisation itself is done there and cached here, because normalising costs
 * an Intl formatter and a parse of every declared interval.
 */
async function loadCalendar(calendarId) {
  if (!calendarId) return null;
  return cached('calendar', `id:${calendarId}`, async () => {
    const row = await getDb()(CALENDARS).where('id', calendarId).where('is_active', true).first();
    if (!row) return null;
    const holidays = await getDb()(HOLIDAYS)
      .where('calendar_id', row.id)
      .select('holiday_date', 'is_recurring');
    try {
      return businessTime.normalizeCalendar({ ...row, holidays });
    } catch (err) {
      // §12.5: a calendar that does not resolve yields `indeterminate` and a
      // warning, never a thrown request. Degrading the calendar silently — by
      // dropping the interval that would not parse — would shrink the working
      // day and push every due-at later, which is a wrong answer wearing the
      // costume of a right one.
      warn(`calendar ${row.key || row.id} is unusable: ${err.message}`);
      return null;
    }
  });
}

async function loadDefaultCalendar() {
  const row = await cached('calendar', 'default-row', async () => {
    const found = await getDb()(CALENDARS)
      .where('is_default', true)
      .where('is_active', true)
      .orderBy('id', 'asc')
      .first('id');
    return found || null;
  });
  return row ? loadCalendar(row.id) : null;
}

/**
 * §12.4's resolution order: the catalog item's policy, then the desk's, then the
 * tenant default. The catalog step is skipped while helpdesk_catalog_items does
 * not exist — checking rather than assuming means shipping §10 needs no change
 * here.
 */
async function resolvePolicyFor(ticket) {
  if (ticket.sla_policy_id) {
    const pinned = await loadPolicy(ticket.sla_policy_id);
    // A pinned policy that has been deleted must not silently re-resolve to a
    // different promise: fall through, and let the recompute record the change.
    if (pinned) return pinned;
  }

  if (ticket.catalog_item_id && await hasTable(CATALOG_ITEMS)) {
    const item = await cached('misc', `catalog:${ticket.catalog_item_id}`, () =>
      getDb()(CATALOG_ITEMS).where('id', ticket.catalog_item_id).first('sla_policy_id'));
    if (item && item.sla_policy_id) {
      const policy = await loadPolicy(item.sla_policy_id);
      if (policy) return policy;
    }
  }

  const desk = await loadDesk(ticket.desk_id);
  if (desk && desk.sla_policy_id) {
    const policy = await loadPolicy(desk.sla_policy_id);
    if (policy) return policy;
  }

  return loadDefaultPolicy();
}

async function resolveCalendarFor(policy, desk) {
  if (policy && policy.business_calendar_id) {
    const calendar = await loadCalendar(policy.business_calendar_id);
    if (calendar) return calendar;
  }
  if (desk && desk.business_calendar_id) {
    const calendar = await loadCalendar(desk.business_calendar_id);
    if (calendar) return calendar;
  }
  return loadDefaultCalendar();
}

/**
 * Everything an evaluation needs, resolved once. Returns null when the ticket
 * cannot be measured at all — no policy, no calendar, no target for its
 * priority, or an imported ticket — which is precisely `indeterminate`.
 */
async function resolveContext(ticket) {
  if (truthy(ticket.is_imported)) return null;
  const policy = await resolvePolicyFor(ticket);
  if (!policy) return null;
  const desk = await loadDesk(ticket.desk_id);
  const calendar = await resolveCalendarFor(policy, desk);
  if (!calendar) return null;
  // A policy with no row for this priority makes no promise about it. That is a
  // different statement from promising zero, and reporting it as compliant would
  // inflate the compliance figure with tickets nobody ever measured.
  const target = policy.targets[String(ticket.priority || '')] || null;
  if (!target) return null;
  return { policy, desk, calendar, target };
}

function normalizeSteps(raw) {
  const list = parseJson(raw);
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const step of list) {
    if (!step || typeof step !== 'object') continue;
    const atPct = Number(step.at_pct);
    const action = String(step.action || '').trim().toLowerCase();
    if (!Number.isFinite(atPct) || atPct <= 0 || !action) continue;
    if (!ESCALATION_ACTIONS.has(action)) {
      // Fail closed: an instruction nobody wrote code for is not executed and
      // not silently dropped either.
      warn(`ignoring unknown escalation action ${JSON.stringify(action)}`);
      continue;
    }
    const to = step.to === undefined || step.to === null ? null : String(step.to);
    out.push({ at_pct: atPct, action, to, key: `${atPct}:${action}:${to || ''}` });
  }
  return out.sort((a, b) => a.at_pct - b.at_pct);
}

/** One ticket shape, whether the row came from knex or from documents(). */
function mapTicket(row) {
  if (!row) return null;
  return {
    id: toNumber(row.id, null),
    documentId: row.documentId || row.document_id || null,
    status: row.status || null,
    priority: row.priority || null,
    desk_id: row.desk_id === null || row.desk_id === undefined ? null : toNumber(row.desk_id, null),
    team_id: row.team_id === null || row.team_id === undefined ? null : toNumber(row.team_id, null),
    branch_id: row.branch_id === null || row.branch_id === undefined ? null : toNumber(row.branch_id, null),
    catalog_item_id: row.catalog_item_id === null || row.catalog_item_id === undefined
      ? null
      : toNumber(row.catalog_item_id, null),
    sla_policy_id: row.sla_policy_id === null || row.sla_policy_id === undefined
      ? null
      : toNumber(row.sla_policy_id, null),
    workflow_id: row.workflow_id === null || row.workflow_id === undefined
      ? null
      : toNumber(row.workflow_id, null),
    stage_key: row.stage_key || null,
    first_response_due_at: toDate(row.first_response_due_at),
    first_response_at: toDate(row.first_response_at),
    resolution_due_at: toDate(row.resolution_due_at),
    sla_state: row.sla_state || null,
    sla_paused_at: toDate(row.sla_paused_at),
    sla_paused_ms: toNumber(row.sla_paused_ms, 0),
    sla_due_at: toDate(row.sla_due_at),
    resolved_at: toDate(row.resolved_at),
    closed_at: toDate(row.closed_at),
    reopened_count: toNumber(row.reopened_count, 0),
    is_imported: truthy(row.is_imported),
    archived_at: toDate(row.archived_at),
    created_at: toDate(row.created_at) || toDate(row.createdAt),
    // Present only on the documents() path; entitlement needs them and the
    // sweep does not, so the sweep never pays for the joins.
    person_id: row.person_id === undefined ? undefined : row.person_id,
    user_id: row.user_id === undefined ? undefined : row.user_id,
    employee_id: row.employee_id === undefined ? undefined : row.employee_id,
    assigned_to_id: row.assigned_to_id === undefined ? undefined : row.assigned_to_id,
  };
}

/**
 * Accepts a row, an id or a documentId. A row is only trusted when it carries
 * `created_at` — a partial projection would otherwise silently produce a clock
 * computed from an undefined start, and a due-at nobody can explain is worse
 * than one extra query.
 */
async function loadTicketRow(ref) {
  if (ref === null || ref === undefined) throw new NotFoundError('No ticket given');

  let lookup = ref;
  if (typeof ref === 'object') {
    if (ref.created_at !== undefined || ref.createdAt !== undefined) return mapTicket(ref);
    lookup = ref.id !== undefined && ref.id !== null ? ref.id : (ref.documentId || ref.document_id);
  }
  if (lookup === null || lookup === undefined || lookup === '') {
    throw new NotFoundError('Ticket reference carries neither an id nor a documentId');
  }

  const qb = getDb()(TICKETS);
  const row = /^\d+$/.test(String(lookup))
    ? await qb.where('id', Number(lookup)).first(TICKET_COLUMNS)
    : await qb.where('document_id', String(lookup)).first(TICKET_COLUMNS);
  if (!row) throw new NotFoundError(`No such ticket: ${lookup}`);
  return mapTicket(row);
}

/**
 * The single-ticket load for anything that has to make an authorization
 * decision. Relations live in link tables, so they come through documents()
 * rather than being joined by hand — the shim already knows the derived table
 * and column names, and hand-writing them here would be a second copy of a
 * naming rule that scripts/validate-schema.js owns.
 */
async function loadTicketForActor(documentId) {
  const doc = await documents(TICKET_UID).findFirst({
    filters: { documentId: String(documentId) },
    populate: { person: true, user: true, employee: true, assigned_to: true },
  });
  if (!doc) throw new NotFoundError(`No such ticket: ${documentId}`);
  return mapTicket({
    ...doc,
    person_id: doc.person ? doc.person.id : null,
    user_id: doc.user ? doc.user.id : null,
    employee_id: doc.employee ? doc.employee.id : null,
    assigned_to_id: doc.assigned_to ? doc.assigned_to.id : null,
  });
}

// ── the arithmetic ────────────────────────────────────────────────────────

/**
 * The two due-at instants for a ticket under a policy and a calendar. Pure: no
 * database access, no clamping, no opinion about what may be written — that is
 * recomputeFor's job, and keeping them apart is what makes this testable
 * against the cases §12 asks for.
 *
 * Both clocks start at the ticket's creation instant, and a ticket created
 * outside working hours starts at the next working minute — which addBusinessMs
 * does by construction, because zero business milliseconds after 22:00 on a
 * Friday is 09:00 on the Monday.
 *
 * @param {object} ticket    needs created_at and priority
 * @param {object} policy    a loadPolicy() result (carries `targets`)
 * @param {object} calendar  a business-time calendar (raw row or normalized)
 * @param {object} [options] { resolutionStartedAt } — the reopen restart basis
 */
function computeTargets(ticket, policy, calendar, options = {}) {
  const out = { first_response_due_at: null, resolution_due_at: null };
  if (!ticket || !policy || !calendar) return out;

  // A policy object always carries `targets`. Anything else means this was
  // called with the seam's (actor, ticket, { desk }) shape, which would
  // otherwise return two nulls and have the caller stamp them onto the ticket —
  // a wrong answer indistinguishable from a right one. Fail loudly instead;
  // TicketService's degradable wrapper turns the throw into a warning and an
  // indeterminate SLA, which is its documented degradation.
  if (!policy.targets || typeof policy.targets !== 'object') {
    throw new ValidationError(
      'computeTargets(ticket, policy, calendar) takes a loaded SLA policy. '
      + 'For the TicketService seam call targetsForCreate(actor, ticket, { desk })'
    );
  }

  const target = policy.targets[String(ticket.priority || '')];
  if (!target) return out;

  const created = toDate(ticket.created_at) || toDate(ticket.createdAt);
  if (!created) return out;

  if (target.first_response_ms !== null) {
    out.first_response_due_at = businessTime.addBusinessMs(calendar, created, target.first_response_ms);
  }
  if (target.resolution_ms !== null) {
    const from = toDate(options.resolutionStartedAt) || created;
    out.resolution_due_at = businessTime.addBusinessMs(calendar, from, target.resolution_ms);
  }
  return out;
}

/**
 * One clock's live reading. `reference` is the instant it is measured at — now
 * for the first-response clock always, and `sla_paused_at` for a paused
 * resolution clock (see the file header).
 */
function readClock(calendar, { dueAt, targetMs, thresholdPct, reference, stopped, stoppedAt }) {
  const reading = {
    due_at: dueAt || null,
    target_ms: targetMs || null,
    stopped: Boolean(stopped),
    stopped_at: stoppedAt || null,
    remaining_ms: null,
    elapsed_pct: null,
    breached: false,
    at_risk: false,
    met: null,
  };
  if (!dueAt) return reading;

  if (stopped) {
    // A stopped clock reports history — but a breach that already happened stays
    // on the record. Resolving a late ticket must not repaint it `ok`: it would
    // erase the breach from the queue, from §12.12's breach count, and from the
    // one report the desk is judged on. A clock that stopped with no milestone
    // instant at all was missed if its promise had already passed, and is simply
    // unmeasurable if it had not.
    reading.met = stoppedAt
      ? stoppedAt.getTime() <= dueAt.getTime()
      : (reference.getTime() >= dueAt.getTime() ? false : null);
    reading.breached = reading.met === false;
    reading.remaining_ms = 0;
    return reading;
  }

  const remaining = businessTime.elapsedBusinessMs(calendar, reference, dueAt);
  reading.remaining_ms = remaining;

  if (reference.getTime() >= dueAt.getTime()) {
    reading.breached = true;
    reading.met = false;
    const overrun = businessTime.elapsedBusinessMs(calendar, dueAt, reference);
    reading.elapsed_pct = targetMs ? Math.round(((targetMs + overrun) / targetMs) * 100) : null;
    return reading;
  }

  if (targetMs) {
    reading.elapsed_pct = Math.round(((targetMs - remaining) / targetMs) * 100);
    // 80% elapsed is the same statement as "no more than 20% of the target
    // remains", and expressing it as remaining time means the reading needs no
    // start instant — which is what lets a reopened or extended clock be read
    // correctly from its due-at alone.
    reading.at_risk = remaining <= ((100 - thresholdPct) / 100) * targetMs;
  }
  return reading;
}

/**
 * Both clocks plus the single materialised state. Synchronous and pure over
 * (ticket, context, now) so the sweep can call it per ticket without a query.
 */
function evaluate(ticket, context, now) {
  if (!context) return { state: STATE.INDETERMINATE, clocks: {}, paused: false };

  const { calendar, target } = context;
  const paused = Boolean(ticket.sla_paused_at);
  const firstResponseAt = ticket.first_response_at;
  const resolutionStopped = CLOCK_STOPPING_STATUSES.includes(String(ticket.status));

  const clocks = {
    [CLOCK.FIRST_RESPONSE]: readClock(calendar, {
      dueAt: ticket.first_response_due_at,
      targetMs: target.first_response_ms,
      thresholdPct: target.at_risk_threshold_pct,
      // Never paused, never frozen — the whole point of the first clock.
      reference: now,
      stopped: Boolean(firstResponseAt) || resolutionStopped,
      stoppedAt: firstResponseAt,
    }),
    [CLOCK.RESOLUTION]: readClock(calendar, {
      dueAt: ticket.resolution_due_at,
      targetMs: target.resolution_ms,
      thresholdPct: target.at_risk_threshold_pct,
      reference: paused ? ticket.sla_paused_at : now,
      stopped: resolutionStopped,
      // A ticket cancelled or merged without ever being resolved has no
      // resolution instant, and inventing one from closed_at would report a
      // promise as kept that was never kept. `met` stays null instead.
      stoppedAt: ticket.resolved_at || null,
    }),
  };

  // Breach is read from every clock that made a promise, at risk only from the
  // ones still running — a stopped clock cannot become at risk, but it can
  // already have failed.
  const promised = Object.values(clocks).filter((c) => c.due_at);
  const live = promised.filter((c) => !c.stopped);
  let state;
  if (!promised.length) {
    state = STATE.INDETERMINATE;
  } else if (promised.some((c) => c.breached)) {
    state = STATE.BREACHED;
  } else if (live.some((c) => c.at_risk)) {
    state = STATE.AT_RISK;
  } else if (paused && !resolutionStopped) {
    state = STATE.PAUSED;
  } else {
    state = STATE.OK;
  }

  return { state, clocks, paused };
}

/**
 * The ticket's SLA state. Resolves the policy and calendar itself unless the
 * caller has already done so — the sweep has, once per policy, which is the
 * difference between one query and one per ticket.
 */
async function stateOf(ticket, context) {
  const row = await loadTicketRow(ticket);
  const resolved = context === undefined ? await resolveContext(row) : context;
  return evaluate(row, resolved, new Date()).state;
}

// ── writing ───────────────────────────────────────────────────────────────

/**
 * A guarded patch of the SLA columns and nothing else. `status` is not in any
 * caller's patch and could not be: only TicketService.transition changes it.
 * `updated_at` is deliberately absent — see the file header.
 */
async function patchTicket(ticketId, patch, guard = {}) {
  const qb = getDb()(TICKETS).where('id', ticketId);
  for (const [column, value] of Object.entries(guard)) {
    if (value === null) qb.whereNull(column);
    else qb.where(column, value);
  }
  return qb.update(patch);
}

function eventBase(ticket, actor) {
  return {
    entityUid: TICKET_UID,
    documentId: ticket.documentId,
    actor: entitlement.eventActor(actor),
  };
}

function ticketRef(ticket) {
  return {
    ticket_id: ticket.id,
    ticket_document_id: ticket.documentId,
    desk_id: ticket.desk_id,
    team_id: ticket.team_id,
    branch_id: ticket.branch_id,
    priority: ticket.priority,
    status: ticket.status,
  };
}

// ── first response ────────────────────────────────────────────────────────

/**
 * Stamp the first-response instant. Called by MessageService when a PUBLIC
 * agent message lands (RULE-18).
 *
 * Idempotent by the WHERE clause, not by a read-then-write: two agents replying
 * in the same second would both see a null and both stamp, and the second write
 * would move a milestone that is supposed to be immovable. The conditional
 * update makes the first writer the only writer.
 *
 * It is NEVER unstamped and never recomputed — not on reopen, not by
 * recomputeFor, not by an extension. The requester's experience of being heard
 * happened, and no later event un-happens it.
 */
async function stampFirstResponse(ticket, at, options = {}) {
  const row = await loadTicketRow(ticket);
  if (row.first_response_at) return { stamped: false, first_response_at: row.first_response_at };

  const when = toDate(at) || nowFrom(options);
  const changed = await patchTicket(row.id, { first_response_at: when }, { first_response_at: null });
  if (!changed) {
    const current = await loadTicketRow(row.id);
    return { stamped: false, first_response_at: current.first_response_at };
  }

  const context = await resolveContext({ ...row, first_response_at: when });
  const state = evaluate({ ...row, first_response_at: when }, context, nowFrom(options)).state;
  if (state !== row.sla_state) await patchTicket(row.id, { sla_state: state }, { sla_state: row.sla_state });
  return { stamped: true, first_response_at: when, sla_state: state };
}

// ── recompute ─────────────────────────────────────────────────────────────

/**
 * F5, in one function. A due-at that is still in the future may be moved
 * anywhere in the future; it may not be moved into the past, because that turns
 * a ticket that was compliant a millisecond ago into a breached one on the
 * strength of a configuration change nobody told its requester about.
 */
function guardAgainstRetroactiveBreach(existing, next, now) {
  if (!existing) return { value: next, blocked: false };
  if (!next) return { value: existing, blocked: false };
  const compliant = existing.getTime() > now.getTime();
  if (compliant && next.getTime() <= now.getTime()) return { value: existing, blocked: true };
  return { value: next, blocked: false };
}

/**
 * Did a manager extend this clock to the value currently stored? Derived from
 * the outbox rather than a column: an extension is an audited governance act,
 * and a configuration recompute that silently revoked one would undo a decision
 * without recording that it had. Only consulted when a recompute would pull the
 * due-at earlier, so the common paths never run it.
 *
 * The column that would make this a field read rather than a query is
 * `sla_extended_at`; it is not in the delivered schema and is not worth an
 * ALTER on a live table for one predicate.
 */
async function extensionInForce(ticket, clock, storedDueAt) {
  if (!storedDueAt) return false;
  const rows = await getDb()(EVENTS_TABLE)
    .where('entity_uid', TICKET_UID)
    .where('document_id', ticket.documentId)
    .where('event_name', EVENTS.EXTENDED)
    .orderBy('id', 'desc')
    .limit(20)
    .select('payload');
  for (const row of rows) {
    const payload = parseJson(row.payload) || {};
    if (payload.clock !== clock) continue;
    const to = toDate(payload.to);
    if (to && to.getTime() === storedDueAt.getTime()) return true;
  }
  return false;
}

/**
 * Bring a ticket's targets and state in line with its policy.
 *
 * Called at creation (which also PINS `sla_policy_id`, so a later desk edit
 * cannot change the promise a ticket was given), on reopen with
 * `{ restart: true }`, and by the bounded admin recompute of §12.10.
 *
 * @param {object|number|string} ticket
 * @param {object} [options] { restart, startedAt, actor, reason, now, force }
 */
async function recomputeFor(ticket, options = {}) {
  const row = await loadTicketRow(ticket);
  const now = nowFrom(options);
  const context = await resolveContext(row);

  if (!context) {
    if (row.sla_state !== STATE.INDETERMINATE) {
      await withTransaction(async () => {
        await patchTicket(row.id, { sla_state: STATE.INDETERMINATE }, { sla_state: row.sla_state });
      });
    }
    return { changed: row.sla_state !== STATE.INDETERMINATE, sla_state: STATE.INDETERMINATE, reason: 'no_policy_or_calendar' };
  }

  let computed;
  try {
    computed = computeTargets(row, context.policy, context.calendar, {
      resolutionStartedAt: options.restart ? (toDate(options.startedAt) || now) : null,
    });
  } catch (err) {
    // A malformed calendar throws rather than degrading (see business-time).
    // §12.5 says the ticket still exists and is marked indeterminate.
    warn(`cannot compute targets for ticket ${row.documentId}: ${err.message}`);
    await withTransaction(async () => {
      await patchTicket(row.id, { sla_state: STATE.INDETERMINATE }, { sla_state: row.sla_state });
    });
    return { changed: true, sla_state: STATE.INDETERMINATE, reason: 'calendar_unusable' };
  }

  const patch = {};
  const moved = {};

  if (!row.first_response_at) {
    const guarded = guardAgainstRetroactiveBreach(row.first_response_due_at, computed.first_response_due_at, now);
    let value = guarded.value;
    if (!guarded.blocked && !options.force && row.first_response_due_at && value
      && value.getTime() < row.first_response_due_at.getTime()
      && await extensionInForce(row, CLOCK.FIRST_RESPONSE, row.first_response_due_at)) {
      value = row.first_response_due_at;
    }
    if (!sameInstant(value, row.first_response_due_at)) {
      patch.first_response_due_at = value;
      moved[CLOCK.FIRST_RESPONSE] = { from: row.first_response_due_at, to: value };
    }
  }

  const restart = Boolean(options.restart);
  const guardedResolution = restart
    ? { value: computed.resolution_due_at, blocked: false }
    : guardAgainstRetroactiveBreach(row.resolution_due_at, computed.resolution_due_at, now);
  let resolutionDue = guardedResolution.value;
  if (!restart && !guardedResolution.blocked && !options.force && row.resolution_due_at && resolutionDue
    && resolutionDue.getTime() < row.resolution_due_at.getTime()
    && await extensionInForce(row, CLOCK.RESOLUTION, row.resolution_due_at)) {
    resolutionDue = row.resolution_due_at;
  }
  if (!sameInstant(resolutionDue, row.resolution_due_at)) {
    patch.resolution_due_at = resolutionDue;
    // §7.3: the legacy column is superseded but kept in sync, because the public
    // storefront flow still reads it.
    patch.sla_due_at = resolutionDue;
    moved[CLOCK.RESOLUTION] = { from: row.resolution_due_at, to: resolutionDue };
  }

  if (restart) {
    // A restarted clock is a fresh promise: carrying the previous cycle's pause
    // total forward would make the new one look padded in every report.
    patch.sla_paused_at = null;
    patch.sla_paused_ms = 0;
  }
  if (row.sla_policy_id !== context.policy.id) patch.sla_policy_id = context.policy.id;

  const next = { ...row, ...patch, sla_paused_at: restart ? null : row.sla_paused_at };
  const state = evaluate(next, context, now).state;
  if (state !== row.sla_state) patch.sla_state = state;

  if (!Object.keys(patch).length) return { changed: false, sla_state: state };

  await withTransaction(async () => {
    await patchTicket(row.id, patch);
    if (Object.keys(moved).length) {
      await emit({
        ...eventBase(row, options.actor),
        eventName: EVENTS.RECOMPUTED,
        payload: {
          ...ticketRef(row),
          policy_id: context.policy.id,
          policy_key: context.policy.key,
          reason: options.reason || (restart ? 'reopen' : 'recompute'),
          moved: Object.fromEntries(Object.entries(moved).map(([clock, change]) => [clock, {
            // The promise the ticket was originally given stays reportable here,
            // which is what §12.4's "keep the original target" asks for.
            from: change.from ? change.from.toISOString() : null,
            to: change.to ? change.to.toISOString() : null,
          }])),
          sla_state: state,
        },
      });
    }
  });

  return { changed: true, sla_state: state, moved, ...patch };
}

// ── pausing ───────────────────────────────────────────────────────────────

/**
 * Does this stage pause the resolution clock (§12.6)?
 *
 * The default is "every stage whose canonical status is waiting", which the
 * workflow service already computes — so a desk that invents "Awaiting Parts
 * From Supplier" gets pausing for free, with no code and no configuration.
 * `pause_stages` overrides that by naming stages explicitly, and
 * `pause_on_waiting = false` turns pausing off entirely for the regulated desks
 * that must measure elapsed time regardless.
 */
function pausesInStage(policy, workflow, stageKey) {
  if (!policy || !truthy(policy.pause_on_waiting, true)) return false;
  const named = parseJson(policy.pause_stages);
  if (Array.isArray(named) && named.length) return named.map(String).includes(String(stageKey));
  return workflowService.isPaused(workflow, stageKey);
}

/**
 * The push-out a resume owes: the business time the pause consumed, and the
 * due-at that restores exactly the remaining time the clock stopped with.
 * Shared by resume() and the onStatusChanged seam so the two can never drift.
 */
function resumeArithmetic(row, context, now) {
  if (!context || !row.sla_paused_at) return { pausedMs: 0, resolutionDue: row.resolution_due_at };
  try {
    const pausedMs = businessTime.elapsedBusinessMs(context.calendar, row.sla_paused_at, now);
    const resolutionDue = row.resolution_due_at && pausedMs > 0
      ? businessTime.addBusinessMs(context.calendar, row.resolution_due_at, pausedMs)
      : row.resolution_due_at;
    return { pausedMs, resolutionDue };
  } catch (err) {
    // A calendar that broke while the ticket was parked must not strand it
    // paused forever; resume without a push-out and let the state read
    // indeterminate until the calendar is fixed.
    warn(`cannot measure the pause on ticket ${row.documentId}: ${err.message}`);
    return { pausedMs: 0, resolutionDue: row.resolution_due_at };
  }
}

/**
 * Stop the resolution clock.
 *
 * pause() and resume() are the two methods here that do NOT take an actor, and
 * the exception is deliberate: they are not operations anyone requests. They are
 * the bookkeeping consequence of a stage change that TicketService has already
 * authorized, and re-gating them would deny the system actor doing legitimate
 * clock-keeping on a transition a human was entitled to make. Pass
 * `options.actor` when one is known and it appears on the event envelope.
 *
 * The first-response clock is untouched. That is the rule, not an oversight.
 */
async function pause(ticket, reason, options = {}) {
  const row = await loadTicketRow(ticket);
  if (row.sla_paused_at) return { changed: false, paused_at: row.sla_paused_at };

  const now = nowFrom(options);
  const context = await resolveContext(row);
  const next = { ...row, sla_paused_at: now };
  const state = context ? evaluate(next, context, now).state : STATE.INDETERMINATE;

  const changed = await withTransaction(async () => {
    const applied = await patchTicket(row.id, { sla_paused_at: now, sla_state: state }, { sla_paused_at: null });
    if (!applied) return false;
    await emit({
      ...eventBase(row, options.actor),
      eventName: EVENTS.PAUSED,
      payload: {
        ...ticketRef(row),
        reason: reason ? String(reason).slice(0, MAX_REASON_CHARS) : null,
        stage_key: row.stage_key,
        paused_at: now.toISOString(),
        resolution_due_at: row.resolution_due_at ? row.resolution_due_at.toISOString() : null,
      },
    });
    return true;
  });

  return { changed, paused_at: changed ? now : row.sla_paused_at, sla_state: state };
}

/**
 * Restart the resolution clock, pushing its due-at out by the BUSINESS time the
 * pause consumed — so the ticket resumes with exactly the remaining time it had
 * when it stopped. Pushing by wall-clock time instead would hand back a weekend.
 *
 * `sla_paused_ms` accumulates business milliseconds, the same unit as the
 * targets: it is the quantity actually subtracted from the clock, so
 * `resolution_due_at` reconciles with it, and §12.12's "pause time as a share of
 * total" divides two numbers measured the same way. The column is a bigint,
 * which is ample headroom under either reading.
 */
async function resume(ticket, options = {}) {
  const row = await loadTicketRow(ticket);
  if (!row.sla_paused_at) return { changed: false };

  const now = nowFrom(options);
  const context = await resolveContext(row);
  const { pausedMs, resolutionDue } = resumeArithmetic(row, context, now);

  const patch = {
    sla_paused_at: null,
    sla_paused_ms: row.sla_paused_ms + pausedMs,
  };
  if (!sameInstant(resolutionDue, row.resolution_due_at)) {
    patch.resolution_due_at = resolutionDue;
    patch.sla_due_at = resolutionDue;
  }
  const next = { ...row, ...patch };
  const state = context ? evaluate(next, context, now).state : STATE.INDETERMINATE;
  patch.sla_state = state;

  const changed = await withTransaction(async () => {
    const applied = await patchTicket(row.id, patch, { sla_paused_at: row.sla_paused_at });
    if (!applied) return false;
    await emit({
      ...eventBase(row, options.actor),
      eventName: EVENTS.RESUMED,
      payload: {
        ...ticketRef(row),
        paused_at: row.sla_paused_at.toISOString(),
        resumed_at: now.toISOString(),
        paused_business_ms: pausedMs,
        paused_business_ms_total: patch.sla_paused_ms,
        resolution_due_at: resolutionDue ? resolutionDue.toISOString() : null,
      },
    });
    return true;
  });

  return { changed, paused_business_ms: pausedMs, resolution_due_at: resolutionDue, sla_state: state };
}

// ── the TicketService seam ────────────────────────────────────────────────
//
// TicketService owns the ticket's write, its transaction and its
// compare-and-swap; SLAService owns what the clock says. So these two return a
// COLUMN PATCH rather than writing: the SLA columns then commit atomically with
// the create or the transition that caused them, and a transition that loses its
// compare-and-swap race takes the clock change down with it instead of leaving a
// due-at describing a move that never happened.
//
// Events are still emitted here, inside the caller's ambient transaction, for
// the same reason the outbox exists at all.

/**
 * The SLA columns a newly created ticket should carry. Never writes, never
 * throws — intake must not fail on a downstream concern (§03 F1), so an
 * unmeasurable ticket comes back stamped `indeterminate` and is created anyway.
 */
async function targetsForCreate(actor, ticket, options = {}) {
  const row = mapTicket(ticket);
  const now = nowFrom(options);
  const unmeasured = {
    sla_policy_id: row.sla_policy_id || null,
    first_response_due_at: null,
    resolution_due_at: null,
    sla_due_at: null,
    sla_state: STATE.INDETERMINATE,
  };

  try {
    const context = await resolveContext(
      options.desk && !row.desk_id ? { ...row, desk_id: options.desk.id } : row
    );
    if (!context) return unmeasured;

    const targets = computeTargets(row, context.policy, context.calendar);
    const patch = {
      // Pinned here and never re-resolved: a desk that changes its policy
      // tomorrow does not change the promise this ticket was given.
      sla_policy_id: context.policy.id,
      first_response_due_at: targets.first_response_due_at,
      resolution_due_at: targets.resolution_due_at,
      sla_due_at: targets.resolution_due_at,
    };
    patch.sla_state = evaluate({ ...row, ...patch }, context, now).state;
    return patch;
  } catch (err) {
    warn(`cannot target ticket ${row.documentId || row.id}: ${err.message}`);
    return unmeasured;
  }
}

/**
 * Which stage pauses, resolved from whatever the caller happened to have. The
 * stage object TicketService passes already carries `is_paused`; the workflow is
 * only loaded when it does not.
 */
async function stagePauses(row, policy, stage) {
  if (!policy || !truthy(policy.pause_on_waiting, true)) return false;
  const key = typeof stage === 'string' ? stage : ((stage && stage.key) || row.stage_key);
  const named = parseJson(policy.pause_stages);
  if (Array.isArray(named) && named.length) return named.map(String).includes(String(key));
  if (stage && typeof stage === 'object' && typeof stage.is_paused === 'boolean') return stage.is_paused;
  const wf = await workflowService.getWorkflowFor(TICKET_UID, { workflowId: row.workflow_id });
  return workflowService.isPaused(wf, key);
}

/**
 * What a status change does to the clocks. Called from inside TicketService's
 * transition, before its compare-and-swap.
 *
 * The four cases, in the order they are decided:
 *   reopen        a stopping status → a live one restarts the RESOLUTION clock
 *                 from now and clears the accumulated pause. first_response_at
 *                 is never touched (RULE-18) — the requester was heard, and
 *                 reopening does not un-hear them.
 *   stopping      reaching resolved/closed/cancelled/merged banks any open
 *                 pause and re-reads the state, which keeps a breach that
 *                 already happened rather than repainting the ticket ok.
 *   pause         entering a pausing stage stamps sla_paused_at.
 *   resume        leaving one pushes the resolution due-at out by the business
 *                 time the pause consumed.
 */
async function onStatusChanged(actor, ticket, options = {}) {
  const row = await loadTicketRow(ticket);
  const now = nowFrom(options);
  const fromStatus = String(options.fromStatus || row.status || '');
  const toStatus = String(options.toStatus || row.status || '');
  const stageKey = typeof options.stage === 'string'
    ? options.stage
    : ((options.stage && options.stage.key) || row.stage_key);

  const context = await resolveContext(row);
  const current = { ...row, status: toStatus, stage_key: stageKey };
  const patch = {};
  const events = [];

  const wasStopped = CLOCK_STOPPING_STATUSES.includes(fromStatus);
  const isStopped = CLOCK_STOPPING_STATUSES.includes(toStatus);

  if (wasStopped && !isStopped) {
    if (context) {
      try {
        const restarted = computeTargets(current, context.policy, context.calendar, {
          resolutionStartedAt: now,
        });
        patch.resolution_due_at = restarted.resolution_due_at;
        patch.sla_due_at = restarted.resolution_due_at;
      } catch (err) {
        warn(`cannot restart the resolution clock on ${row.documentId}: ${err.message}`);
      }
    }
    patch.sla_paused_at = null;
    patch.sla_paused_ms = 0;
    events.push({
      eventName: EVENTS.RECOMPUTED,
      payload: {
        ...ticketRef(current),
        reason: 'reopen',
        moved: {
          [CLOCK.RESOLUTION]: {
            from: row.resolution_due_at ? row.resolution_due_at.toISOString() : null,
            to: patch.resolution_due_at ? patch.resolution_due_at.toISOString() : null,
          },
        },
      },
    });
  } else if (row.sla_paused_at && (isStopped || !(await stagePauses(current, context && context.policy, options.stage)))) {
    const { pausedMs, resolutionDue } = resumeArithmetic(row, context, now);
    patch.sla_paused_at = null;
    patch.sla_paused_ms = row.sla_paused_ms + pausedMs;
    // A ticket that stopped while parked banks the pause for reporting but keeps
    // its due-at: pushing out a promise that has already been answered would
    // rewrite history to flatter the desk.
    if (!isStopped && !sameInstant(resolutionDue, row.resolution_due_at)) {
      patch.resolution_due_at = resolutionDue;
      patch.sla_due_at = resolutionDue;
    }
    events.push({
      eventName: EVENTS.RESUMED,
      payload: {
        ...ticketRef(current),
        paused_at: row.sla_paused_at.toISOString(),
        resumed_at: now.toISOString(),
        paused_business_ms: pausedMs,
        paused_business_ms_total: patch.sla_paused_ms,
      },
    });
  } else if (!row.sla_paused_at && !isStopped
    && await stagePauses(current, context && context.policy, options.stage)) {
    patch.sla_paused_at = now;
    events.push({
      eventName: EVENTS.PAUSED,
      payload: { ...ticketRef(current), stage_key: stageKey, paused_at: now.toISOString() },
    });
  }

  const state = evaluate({ ...current, ...patch }, context, now).state;
  if (state !== row.sla_state) patch.sla_state = state;
  if (!Object.keys(patch).length) return null;

  for (const event of events) {
    await emit({ ...eventBase(row, actor), eventName: event.eventName, payload: { ...event.payload, sla_state: state } });
  }
  return patch;
}

// ── extension ─────────────────────────────────────────────────────────────

/**
 * Move a due-at out by hand, with a reason, on the record.
 *
 * MANAGER OR ADMIN ONLY, and the check is composed here rather than added to the
 * entitlement matrix because the matrix belongs to a different file: `can()`
 * denies any capability it does not know, so inventing `sla.extend` there would
 * deny everyone. `ticket.update` carries the desk and branch scoping; the band
 * check on top is what stops an agent extending the promise on their own ticket,
 * which is marking your own homework. When entitlement.js gains an `sla.extend`
 * capability this becomes one assertCan call.
 *
 * Only ever LATER. A due-at pulled earlier by hand would breach a ticket its
 * requester was told was on time — the same rule recomputeFor enforces against
 * configuration changes, applied to a person.
 */
async function extend(actor, ticketDocumentId, newDueAt, reason, options = {}) {
  const resolvedActor = await entitlement.resolveActor(actor, options);
  const text = String(reason === null || reason === undefined ? '' : reason).trim();
  if (!text) {
    throw new ValidationError('An SLA extension needs a reason — it is a promise being changed, not a field');
  }

  const target = toDate(newDueAt);
  if (!target) throw new ValidationError(`newDueAt is not an instant: ${JSON.stringify(newDueAt)}`);

  const clock = options.clock === CLOCK.FIRST_RESPONSE ? CLOCK.FIRST_RESPONSE : CLOCK.RESOLUTION;
  const ticket = await loadTicketForActor(ticketDocumentId);
  const desk = await loadDesk(ticket.desk_id);

  entitlement.assertCan(resolvedActor, 'ticket.update', { ticket, desk });
  if (!entitlement.hasBand(resolvedActor, 'admin') && !entitlement.hasBand(resolvedActor, 'manager')) {
    throw new ForbiddenError('Only a helpdesk manager or admin may extend an SLA target');
  }

  if (clock === CLOCK.FIRST_RESPONSE && ticket.first_response_at) {
    throw new ValidationError('The first-response clock has already stopped — there is nothing left to extend');
  }

  const column = clock === CLOCK.FIRST_RESPONSE ? 'first_response_due_at' : 'resolution_due_at';
  const current = clock === CLOCK.FIRST_RESPONSE ? ticket.first_response_due_at : ticket.resolution_due_at;
  if (current && target.getTime() <= current.getTime()) {
    throw new ValidationError(
      `An extension moves a target later. ${column} is ${current.toISOString()}; `
      + `${target.toISOString()} is not after it`
    );
  }

  const now = nowFrom(options);
  const patch = { [column]: target };
  if (clock === CLOCK.RESOLUTION) patch.sla_due_at = target;

  const context = await resolveContext(ticket);
  const state = evaluate({ ...ticket, ...patch }, context, now).state;
  patch.sla_state = state;

  await withTransaction(async () => {
    await patchTicket(ticket.id, patch, { [column]: current });
    await emit({
      ...eventBase(ticket, resolvedActor),
      eventName: EVENTS.EXTENDED,
      payload: {
        ...ticketRef(ticket),
        clock,
        from: current ? current.toISOString() : null,
        to: target.toISOString(),
        reason: text.slice(0, MAX_REASON_CHARS),
        source: entitlement.auditSource(resolvedActor),
        sla_state: state,
      },
    });
    // The timeline projection. Unlike services/strapi's logActivity this is NOT
    // best-effort: an SLA extension is a governance act, and one that could
    // silently fail to be recorded must not be allowed to happen. `kind` is
    // 'note' because the generic enum has no SLA member and widening it is a
    // services/strapi schema change this module does not own.
    await documents(ACTIVITY_UID).create({
      data: {
        entity_uid: TICKET_UID,
        target_document_id: ticket.documentId,
        kind: 'note',
        summary: `SLA ${clock.replace('_', ' ')} target extended`,
        from_value: current ? current.toISOString() : null,
        to_value: target.toISOString(),
        actor_label: resolvedActor.label || null,
        data: { reason: text.slice(0, MAX_REASON_CHARS), clock, source: entitlement.auditSource(resolvedActor) },
      },
    });
  });

  return { clock, from: current, to: target, sla_state: state };
}

// ── the sweep ─────────────────────────────────────────────────────────────

function announcementKey(documentId, eventName, payload) {
  const due = payload && payload.due_at ? new Date(payload.due_at).getTime() : 0;
  const clock = (payload && payload.clock) || '';
  const step = eventName === EVENTS.ESCALATED ? (payload && payload.step_key) || '' : '';
  return [documentId, eventName, clock, Number.isFinite(due) ? due : 0, step].join('|');
}

/**
 * Everything already announced for this batch, in one query served by
 * core_events_subject_idx. Reading the outbox is what makes the sweep deduped
 * and restart-safe at the same time: the record of what was said survives a
 * restart, so a missed run catches up instead of losing a breach.
 */
async function loadAnnounced(documentIds) {
  const announced = new Set();
  if (!documentIds.length) return announced;
  const rows = await getDb()(EVENTS_TABLE)
    .where('entity_uid', TICKET_UID)
    .whereIn('document_id', documentIds)
    .whereIn('event_name', ANNOUNCED_EVENT_NAMES)
    .select('document_id', 'event_name', 'payload');
  for (const row of rows) {
    announced.add(announcementKey(row.document_id, row.event_name, parseJson(row.payload) || {}));
  }
  return announced;
}

/**
 * The escalation ladder is evaluated on the RESOLUTION clock only. §12.9's steps
 * run to 150% and 200% of the target, which is a statement about a ticket that
 * is already overdue and still not fixed; running the same ladder on the
 * first-response clock would fire four escalations before an agent has had a
 * realistic chance to type a sentence. A first-response breach is still
 * announced — as `helpdesk.sla.breached`, which the notification subscriber acts
 * on.
 */
function dueEscalations(steps, reading) {
  if (!steps.length || !reading || !reading.due_at || reading.stopped) return [];
  if (reading.elapsed_pct === null) return [];
  return steps.filter((step) => reading.elapsed_pct >= step.at_pct);
}

async function flagTicket(row, now, announced, stats) {
  const context = await resolveContext(row);
  const result = evaluate(row, context, now);
  const pending = [];

  for (const clock of [CLOCK.FIRST_RESPONSE, CLOCK.RESOLUTION]) {
    const reading = result.clocks[clock];
    if (!reading || !reading.due_at || reading.stopped) continue;
    const dueIso = reading.due_at.toISOString();
    const milestone = reading.breached ? EVENTS.BREACHED : (reading.at_risk ? EVENTS.AT_RISK : null);
    if (!milestone) continue;
    const payload = {
      ...ticketRef(row),
      clock,
      due_at: dueIso,
      target_ms: reading.target_ms,
      remaining_business_ms: reading.remaining_ms,
      elapsed_pct: reading.elapsed_pct,
      // A milestone is keyed to the cycle it belongs to, so a reopened ticket
      // can breach again without the previous cycle's event suppressing it.
      reopened_count: row.reopened_count,
    };
    if (announced.has(announcementKey(row.documentId, milestone, payload))) continue;
    pending.push({ eventName: milestone, payload });
  }

  if (context && context.target.escalation_steps.length) {
    const reading = result.clocks[CLOCK.RESOLUTION];
    for (const step of dueEscalations(context.target.escalation_steps, reading)) {
      const payload = {
        ...ticketRef(row),
        clock: CLOCK.RESOLUTION,
        due_at: reading.due_at.toISOString(),
        step_key: step.key,
        at_pct: step.at_pct,
        action: step.action,
        to: step.to,
        elapsed_pct: reading.elapsed_pct,
      };
      if (announced.has(announcementKey(row.documentId, EVENTS.ESCALATED, payload))) continue;
      pending.push({ eventName: EVENTS.ESCALATED, payload });
    }
  }

  const stateChanged = result.state !== row.sla_state;
  if (!stateChanged && !pending.length) return;

  await withTransaction(async () => {
    if (stateChanged) {
      await patchTicket(row.id, { sla_state: result.state }, { sla_state: row.sla_state });
    }
    for (const event of pending) {
      await emit({ ...eventBase(row, null), eventName: event.eventName, payload: event.payload });
    }
  });

  if (stateChanged) stats.updated += 1;
  for (const event of pending) {
    if (event.eventName === EVENTS.BREACHED) stats.breached += 1;
    else if (event.eventName === EVENTS.AT_RISK) stats.at_risk += 1;
    else stats.escalated += 1;
  }
  if (result.state === STATE.INDETERMINATE) stats.indeterminate += 1;
}

/**
 * One sweep pass.
 *
 * The candidate set is non-terminal, non-archived, non-imported tickets that
 * carry at least one due-at. A ticket with no target is INVISIBLE to the sweep
 * by design: it has no promise to break, and retro-targeting it here would be
 * the sweep quietly deciding what the desk had committed to. Giving those
 * tickets targets is the recompute endpoint's job (§12.10), where it is bounded
 * and audited.
 *
 * At-risk cannot be pushed into SQL — the threshold is a business-time distance
 * from the due-at and the calendar lives in this process — so the pass walks the
 * non-terminal set in id-ordered batches rather than pretending a WHERE clause
 * could select it. Idempotent: every write is guarded on the value it observed,
 * so a second pass changes nothing, and a pass interrupted halfway resumes from
 * stored state on the next run.
 */
async function sweep(options = {}) {
  const now = nowFrom(options);
  const batchSize = Number.isInteger(options.batchSize) && options.batchSize > 0
    ? options.batchSize
    : intEnv('RUTBA_CORE_HELPDESK_SLA_BATCH', 500);
  const maxBatches = Number.isInteger(options.maxBatches) && options.maxBatches > 0
    ? options.maxBatches
    : intEnv('RUTBA_CORE_HELPDESK_SLA_MAX_BATCHES', 200);

  const stats = {
    scanned: 0, batches: 0, updated: 0,
    at_risk: 0, breached: 0, escalated: 0, indeterminate: 0, errors: 0, truncated: false,
  };

  let cursor = Number.isInteger(options.afterId) ? options.afterId : 0;
  for (let pass = 0; pass < maxBatches; pass++) {
    const rows = await getDb()(TICKETS)
      .whereNotIn('status', CLOCK_STOPPING_STATUSES)
      .whereNull('archived_at')
      .where(function notImported() { this.where('is_imported', false).orWhereNull('is_imported'); })
      .where(function hasATarget() {
        this.whereNotNull('first_response_due_at').orWhereNotNull('resolution_due_at');
      })
      .where('id', '>', cursor)
      .orderBy('id', 'asc')
      .limit(batchSize)
      .select(TICKET_COLUMNS);
    if (!rows.length) return stats;

    stats.batches += 1;
    stats.scanned += rows.length;
    cursor = toNumber(rows[rows.length - 1].id, cursor);

    const tickets = rows.map(mapTicket).filter((t) => t.documentId);
    const announced = await loadAnnounced(tickets.map((t) => t.documentId));

    for (const ticket of tickets) {
      try {
        await flagTicket(ticket, now, announced, stats);
      } catch (err) {
        // One unusable ticket must not cost the desk the rest of the sweep.
        stats.errors += 1;
        warn(`sweep failed on ticket ${ticket.documentId}: ${err.message}`);
      }
    }

    if (rows.length < batchSize) return stats;
  }

  stats.truncated = true;
  warn(`sweep stopped after ${maxBatches} batches at ticket id ${cursor} — raise RUTBA_CORE_HELPDESK_SLA_MAX_BATCHES`);
  return stats;
}

// ── per-ticket detail (§12.10) ────────────────────────────────────────────

/**
 * The read behind GET /api/helpdesk/tickets/:id/sla. Entitlement is checked here
 * rather than at the route, because a cross-desk read stopped only by a route
 * policy is one refactor away from a breach.
 */
async function detailFor(actor, ticketDocumentId, options = {}) {
  const resolvedActor = await entitlement.resolveActor(actor, options);
  const ticket = await loadTicketForActor(ticketDocumentId);
  const desk = await loadDesk(ticket.desk_id);
  entitlement.assertCan(resolvedActor, 'ticket.read', { ticket, desk });

  const now = nowFrom(options);
  const context = await resolveContext(ticket);
  const result = evaluate(ticket, context, now);

  const clock = (name) => {
    const reading = result.clocks[name] || {};
    return {
      due_at: reading.due_at || null,
      target_minutes: reading.target_ms ? Math.round(reading.target_ms / MINUTE_MS) : null,
      remaining_business_ms: reading.remaining_ms === undefined ? null : reading.remaining_ms,
      elapsed_pct: reading.elapsed_pct === undefined ? null : reading.elapsed_pct,
      breached: Boolean(reading.breached),
      at_risk: Boolean(reading.at_risk),
      met: reading.met === undefined ? null : reading.met,
      stopped_at: reading.stopped_at || null,
    };
  };

  return {
    ticket_document_id: ticket.documentId,
    sla_state: result.state,
    measured: Boolean(context),
    is_imported: ticket.is_imported,
    policy: context ? { id: context.policy.id, key: context.policy.key, name: context.policy.name } : null,
    calendar: context ? { key: context.calendar.key, timezone: context.calendar.timezone } : null,
    first_response: { ...clock(CLOCK.FIRST_RESPONSE), at: ticket.first_response_at },
    resolution: clock(CLOCK.RESOLUTION),
    paused: {
      // Frozen: while paused, the resolution clock is read as of this instant.
      at: ticket.sla_paused_at,
      total_business_ms: ticket.sla_paused_ms,
    },
    escalation_steps: context ? context.target.escalation_steps : [],
  };
}

registerCron(SWEEP_CRON, get('RUTBA_CORE_HELPDESK_SLA_RULE', '*/15 * * * *'), () => sweep());

module.exports = {
  computeTargets,
  recomputeFor,
  pause,
  resume,
  // The TicketService seam (spec 00: routes and callers stay thin, services own
  // behaviour). These return column patches for the caller's own transaction.
  targetsForCreate,
  onStatusChanged,
  stateOf,
  sweep,
  extend,
  stampFirstResponse,
  detailFor,
  pausesInStage,
  resolvePolicyFor,
  resolveContext,
  loadCalendar,
  loadPolicy,
  invalidate,
  evaluate,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  STATE,
  CLOCK,
  EVENTS,
  SWEEP_CRON,
  CLOCK_STOPPING_STATUSES,
  ESCALATION_ACTIONS,
};
