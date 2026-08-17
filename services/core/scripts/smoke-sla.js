#!/usr/bin/env node
'use strict';

/**
 * Smoke for the SLA engine (src/domain/helpdesk/business-time.js and
 * sla.service.js).
 *
 * Three parts, because the module has three kinds of claim and only one of them
 * needs a database:
 *
 *  - PART A, business time, is pure arithmetic over a hand-built calendar. This
 *    is where §12's acceptance criteria actually live: weekends, holidays, split
 *    shifts, creation outside working hours and timezone boundaries — including
 *    a DST gap and a DST overlap, which are the two cases every naive
 *    implementation gets wrong and no amount of code reading catches. The
 *    Karachi expectations are hand-computed in the comments so a failure says
 *    which side is wrong.
 *
 *  - PART B, the clocks, drives computeTargets and evaluate with in-memory
 *    tickets. The headline assertions are here: the first-response clock does
 *    not pause, a paused resolution clock is frozen at `sla_paused_at` rather
 *    than sliding toward a false breach, a resolved-late ticket keeps its
 *    breach, and pausing and resuming returns exactly the remaining time it
 *    started with.
 *
 *  - PART C, the database, is MARKER-ONLY. It reads the seeded configuration and
 *    drives ONE marker ticket through recompute → sweep → dedupe → first
 *    response → pause → resume → F5. contact_tickets holds live rows, so
 *    cleanup runs before the phases as well as in a finally, and every write is
 *    keyed to the marker: a crashed earlier run must not leave a fake ticket in
 *    somebody's queue.
 *
 * NOT COVERED, and deliberately: extend()'s "later only" rule and its
 * work-item-activity row need an actor holding the helpdesk_manager app role,
 * and minting one would mean writing to up_users and api_pro_app_roles — real
 * identity rows, for a test. The two refusals reachable without an identity (a
 * missing reason, and a system actor being told no) are asserted instead.
 *
 * Requires migrations 001 and 010–016. It says so and exits rather than
 * guessing.
 *
 *   node scripts/smoke-sla.js
 */

const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');
const { EVENTS_TABLE, DELIVERIES_TABLE } = require('../src/platform/events');
const bt = require('../src/domain/helpdesk/business-time');
const sla = require('../src/domain/helpdesk/sla.service');

const MARKER = '__rutba_core_sla_smoke__';
const TICKET_UID = 'api::contact-ticket.contact-ticket';
const ACTIVITY_UID = 'api::work-item-activity.work-item-activity';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const OK = sla.STATE.OK;

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail !== undefined ? ` — ${detail}` : ''}`); }
}

const at = (iso) => new Date(iso);

/** Karachi wall-clock rendering, so a failure is readable by the person who wrote the calendar. */
function pkt(value) {
  if (!value) return String(value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi', weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(value instanceof Date ? value : new Date(value));
}

// ── part A: business time ─────────────────────────────────────────────────

// The seeded standard calendar, reproduced literally: Friday carries the Jummah
// break, which is the whole reason working_days holds a LIST of intervals per
// day rather than one start and one end.
const KARACHI = {
  key: 'smoke-karachi',
  timezone: 'Asia/Karachi',
  working_days: {
    mon: [{ start: '09:00', end: '18:00' }],
    tue: [{ start: '09:00', end: '18:00' }],
    wed: [{ start: '09:00', end: '18:00' }],
    thu: [{ start: '09:00', end: '18:00' }],
    fri: [{ start: '09:00', end: '12:30' }, { start: '14:30', end: '18:00' }],
    sat: [{ start: '09:00', end: '18:00' }],
    sun: [],
  },
  holidays: [{ holiday_date: '2026-08-14', is_recurring: true }],
};

// 2026-08-07 is a Friday, 08 Saturday, 09 Sunday, 10 Monday, 14 a Friday and
// Independence Day.
function partA() {
  console.log('\nA. business time');
  const cal = bt.normalizeCalendar(KARACHI);

  check('normalizeCalendar is idempotent', bt.normalizeCalendar(cal) === cal);
  check('Friday keeps both shifts', cal.days[5].length === 2, JSON.stringify(cal.days[5]));
  check('Sunday is closed', cal.days[0].length === 0);

  check('inside a shift is working time', bt.isWorkingTime(cal, at('2026-08-10T09:30:00+05:00')));
  check('before opening is not', bt.isWorkingTime(cal, at('2026-08-10T08:30:00+05:00')) === false);
  check('the Jummah break is not working time',
    bt.isWorkingTime(cal, at('2026-08-07T13:00:00+05:00')) === false);
  check('closing time is exclusive — intervals are [start, end)',
    bt.isWorkingTime(cal, at('2026-08-10T18:00:00+05:00')) === false);
  check('Sunday is not working time', bt.isWorkingTime(cal, at('2026-08-09T11:00:00+05:00')) === false);
  check('a holiday is not working time', bt.isWorkingTime(cal, at('2026-08-14T10:00:00+05:00')) === false);
  check('a recurring holiday recurs the next year',
    bt.isWorkingTime(cal, at('2027-08-14T10:00:00+05:00')) === false);

  // Fri 7h (9h minus the 2h break) + Sat 9h + Sun 0 = 16h.
  check('elapsed skips the weekend and the Jummah break',
    bt.elapsedBusinessMs(cal, at('2026-08-07T09:00:00+05:00'), at('2026-08-10T09:00:00+05:00')) === 16 * HOUR,
    bt.elapsedBusinessMs(cal, at('2026-08-07T09:00:00+05:00'), at('2026-08-10T09:00:00+05:00')) / HOUR);
  check('a whole holiday elapses no business time',
    bt.elapsedBusinessMs(cal, at('2026-08-14T00:00:00+05:00'), at('2026-08-15T00:00:00+05:00')) === 0);
  check('a backwards span is zero, not negative',
    bt.elapsedBusinessMs(cal, at('2026-08-10T12:00:00+05:00'), at('2026-08-10T10:00:00+05:00')) === 0);

  // Fri 17:55 + 4h: 5 min left on Friday, the rest from Saturday 09:00.
  check('a target crosses the closing bell into the next working day',
    bt.addBusinessMs(cal, at('2026-08-07T17:55:00+05:00'), 4 * HOUR).getTime()
      === at('2026-08-08T12:55:00+05:00').getTime(),
    pkt(bt.addBusinessMs(cal, at('2026-08-07T17:55:00+05:00'), 4 * HOUR)));
  // Sat 17:00 + 2h: 1h left on Saturday, Sunday closed, 1h from Monday 09:00.
  check('a target skips the weekend',
    bt.addBusinessMs(cal, at('2026-08-08T17:00:00+05:00'), 2 * HOUR).getTime()
      === at('2026-08-10T10:00:00+05:00').getTime(),
    pkt(bt.addBusinessMs(cal, at('2026-08-08T17:00:00+05:00'), 2 * HOUR)));
  // Fri 12:00 + 1h: 30 min to the break, 30 min from 14:30.
  check('a target steps over a split shift',
    bt.addBusinessMs(cal, at('2026-08-07T12:00:00+05:00'), HOUR).getTime()
      === at('2026-08-07T15:00:00+05:00').getTime(),
    pkt(bt.addBusinessMs(cal, at('2026-08-07T12:00:00+05:00'), HOUR)));
  // Thu 17:00 + 2h: 1h to close, Friday is Independence Day, 1h from Saturday.
  check('a target skips a holiday wholesale',
    bt.addBusinessMs(cal, at('2026-08-13T17:00:00+05:00'), 2 * HOUR).getTime()
      === at('2026-08-15T10:00:00+05:00').getTime(),
    pkt(bt.addBusinessMs(cal, at('2026-08-13T17:00:00+05:00'), 2 * HOUR)));

  // §12.5: a ticket created outside working hours starts at the next working
  // minute, which is what zero business milliseconds means.
  check('a ticket raised on Sunday night starts its clock Monday morning',
    bt.nextWorkingInstant(cal, at('2026-08-09T22:00:00+05:00')).getTime()
      === at('2026-08-10T09:00:00+05:00').getTime(),
    pkt(bt.nextWorkingInstant(cal, at('2026-08-09T22:00:00+05:00'))));
  check('a ticket raised during working hours starts immediately',
    bt.nextWorkingInstant(cal, at('2026-08-10T11:11:00+05:00')).getTime()
      === at('2026-08-10T11:11:00+05:00').getTime());

  // The timezone is the CALENDAR's. The same instant is inside the working day
  // in Karachi and outside it in London, and the calendar decides.
  const london = bt.normalizeCalendar({ ...KARACHI, key: 'smoke-london', timezone: 'Europe/London' });
  const instant = at('2026-08-10T05:00:00Z'); // 10:00 in Karachi, 06:00 in London
  check('one instant, two calendars, two answers',
    bt.isWorkingTime(cal, instant) === true && bt.isWorkingTime(london, instant) === false);
  // 2026-08-10T20:00Z is 2026-08-11 01:00 in Karachi — the next local day.
  check('a local day boundary is the calendar\'s, not UTC\'s',
    bt.isWorkingTime(cal, at('2026-08-10T20:00:00Z')) === false);

  // DST. Nothing in the module may assume Pakistan's constant +05:00.
  const ny = (spans) => bt.normalizeCalendar({
    key: 'smoke-ny', timezone: 'America/New_York',
    working_days: { sun: spans, mon: spans, tue: spans, wed: spans, thu: spans, fri: spans, sat: spans },
  });
  // 2026-03-08: 02:00 → 03:00. A 02:00–06:00 shift was staffed for three hours,
  // and the desk must not be credited with a fourth it could not have worked.
  const gap = ny([{ start: '02:00', end: '06:00' }]);
  check('a spring-forward day is an hour shorter, not the declared length',
    bt.elapsedBusinessMs(gap, at('2026-03-08T00:00:00-05:00'), at('2026-03-09T00:00:00-04:00')) === 3 * HOUR,
    bt.elapsedBusinessMs(gap, at('2026-03-08T00:00:00-05:00'), at('2026-03-09T00:00:00-04:00')) / HOUR);
  check('an ordinary day on the same calendar is the declared length',
    bt.elapsedBusinessMs(gap, at('2026-03-15T00:00:00-04:00'), at('2026-03-16T00:00:00-04:00')) === 4 * HOUR);
  // 2026-11-01: 02:00 → 01:00, so 01:00 happens twice and a 01:00–03:00 shift
  // is three real hours.
  const overlap = ny([{ start: '01:00', end: '03:00' }]);
  check('a fall-back day is an hour longer',
    bt.elapsedBusinessMs(overlap, at('2026-11-01T00:00:00-04:00'), at('2026-11-02T00:00:00-05:00')) === 3 * HOUR,
    bt.elapsedBusinessMs(overlap, at('2026-11-01T00:00:00-04:00'), at('2026-11-02T00:00:00-05:00')) / HOUR);

  // A malformed calendar throws rather than quietly shrinking the working day —
  // a wrong answer that looks like a right one is the failure mode this avoids.
  const throws = (fn) => { try { fn(); return false; } catch (err) { return err.name === 'ValidationError'; } };
  check('an unparseable interval throws',
    throws(() => bt.normalizeCalendar({ key: 'bad', timezone: 'UTC', working_days: { mon: ['9 to 5'] } })));
  check('a backwards interval throws',
    throws(() => bt.normalizeCalendar({ key: 'bad', timezone: 'UTC', working_days: { mon: [{ start: '18:00', end: '09:00' }] } })));
  check('an unknown timezone throws',
    throws(() => bt.normalizeCalendar({ key: 'bad', timezone: 'Mars/Olympus', working_days: { mon: [{ start: '09:00', end: '18:00' }] } })));
  check('a calendar that never opens throws',
    throws(() => bt.normalizeCalendar({ key: 'bad', timezone: 'UTC', working_days: { mon: [], sun: [] } })));
  check('overlapping shifts are merged, not double-counted',
    bt.normalizeCalendar({
      key: 'ok', timezone: 'UTC',
      working_days: { mon: [{ start: '09:00', end: '13:00' }, { start: '12:00', end: '17:00' }] },
    }).days[1].length === 1);
}

// ── part B: the two clocks ────────────────────────────────────────────────

const URGENT = {
  first_response_ms: 30 * MIN,
  resolution_ms: 4 * HOUR,
  at_risk_threshold_pct: 80,
  escalation_steps: [
    { at_pct: 80, action: 'notify', to: 'assignee', key: '80:notify:assignee' },
    { at_pct: 100, action: 'notify', to: 'team_manager', key: '100:notify:team_manager' },
  ],
};

function partB() {
  console.log('\nB. the two clocks');
  const calendar = bt.normalizeCalendar(KARACHI);
  const policy = { id: 1, key: 'smoke', pause_on_waiting: true, pause_stages: null, targets: { urgent: URGENT } };
  const context = { policy, calendar, target: URGENT, desk: null };

  const created = at('2026-08-07T17:55:00+05:00'); // Friday, five minutes before closing
  const base = {
    id: 1, documentId: 'smoke', status: 'open', priority: 'urgent',
    created_at: created, sla_paused_at: null, sla_paused_ms: 0,
    first_response_at: null, resolved_at: null, reopened_count: 0,
  };

  const targets = sla.computeTargets(base, policy, calendar);
  check('first-response target lands on the next working morning',
    targets.first_response_due_at.getTime() === at('2026-08-08T09:25:00+05:00').getTime(),
    pkt(targets.first_response_due_at));
  check('resolution target is four business hours later',
    targets.resolution_due_at.getTime() === at('2026-08-08T12:55:00+05:00').getTime(),
    pkt(targets.resolution_due_at));
  check('a policy that promises nothing on a clock produces no due-at',
    sla.computeTargets(base, { targets: { urgent: { ...URGENT, first_response_ms: null } } }, calendar)
      .first_response_due_at === null);
  check('a priority the policy has no target for produces no due-at at all',
    sla.computeTargets({ ...base, priority: 'low' }, policy, calendar).resolution_due_at === null);

  const ticket = { ...base, ...targets };
  const state = (t, now) => sla.evaluate(t, context, at(now)).state;

  check('inside the promise is ok', state(ticket, '2026-08-08T09:00:00+05:00') === OK);
  check('past the at-risk threshold is at_risk',
    state(ticket, '2026-08-08T09:22:00+05:00') === 'at_risk',
    state(ticket, '2026-08-08T09:22:00+05:00'));
  check('past the promise is breached', state(ticket, '2026-08-08T09:30:00+05:00') === 'breached');
  // Fifteen wall-clock hours after a Friday-evening ticket, only ten minutes of
  // business time have passed — the desk was shut for the rest.
  check('the clock measures business time, not wall clock',
    state(ticket, '2026-08-08T09:05:00+05:00') === OK,
    state(ticket, '2026-08-08T09:05:00+05:00'));
  check('with no policy resolvable the state is indeterminate',
    sla.evaluate(ticket, null, at('2026-08-08T09:00:00+05:00')).state === 'indeterminate');

  // The headline: the resolution clock stops, the first-response clock does not.
  const paused = { ...ticket, sla_paused_at: at('2026-08-08T09:00:00+05:00') };
  check('a paused ticket whose first response is overdue is BREACHED, not paused',
    state(paused, '2026-08-08T12:00:00+05:00') === 'breached',
    state(paused, '2026-08-08T12:00:00+05:00'));

  const answered = { ...paused, first_response_at: at('2026-08-08T09:10:00+05:00') };
  const pausedReading = sla.evaluate(answered, context, at('2026-08-08T12:00:00+05:00'));
  check('once answered and paused, the ticket reads paused', pausedReading.state === 'paused');
  check('the paused resolution clock is frozen at sla_paused_at, not sliding',
    pausedReading.clocks.resolution.remaining_ms === 235 * MIN,
    pausedReading.clocks.resolution.remaining_ms / MIN);
  check('the same ticket unpaused would have burned three more hours',
    sla.evaluate({ ...answered, sla_paused_at: null }, context, at('2026-08-08T12:00:00+05:00'))
      .clocks.resolution.remaining_ms === 55 * MIN);
  check('the first-response clock is stopped and met', pausedReading.clocks.first_response.met === true);

  // A breach that happened stays on the record.
  check('resolved on time is ok',
    state({ ...answered, sla_paused_at: null, status: 'resolved', resolved_at: at('2026-08-08T12:00:00+05:00') },
      '2026-08-09T12:00:00+05:00') === OK);
  check('resolved late stays breached — resolving does not erase the breach',
    state({ ...answered, sla_paused_at: null, status: 'resolved', resolved_at: at('2026-08-08T14:00:00+05:00') },
      '2026-08-09T12:00:00+05:00') === 'breached');
  check('resolved without ever replying is a first-response breach',
    state({ ...ticket, status: 'resolved', resolved_at: at('2026-08-08T12:00:00+05:00') },
      '2026-08-09T12:00:00+05:00') === 'breached');

  // Reopen: the resolution clock restarts, the first response does not move.
  const reopened = sla.computeTargets(answered, policy, calendar, {
    resolutionStartedAt: at('2026-08-10T10:00:00+05:00'),
  });
  check('reopen restarts the resolution clock from the reopen instant',
    reopened.resolution_due_at.getTime() === at('2026-08-10T14:00:00+05:00').getTime(),
    pkt(reopened.resolution_due_at));
  check('reopen does not move the first-response target',
    reopened.first_response_due_at.getTime() === targets.first_response_due_at.getTime());

  // Pause/resume arithmetic: the ticket resumes with exactly what it stopped
  // with. Three shapes — a pause spanning a weekend, one entirely outside
  // working hours, and a one-minute pause inside them.
  const invariant = (pausedAt, resumedAt) => {
    const due = targets.resolution_due_at;
    const before = bt.elapsedBusinessMs(calendar, at(pausedAt), due);
    const consumed = bt.elapsedBusinessMs(calendar, at(pausedAt), at(resumedAt));
    const after = bt.elapsedBusinessMs(calendar, at(resumedAt), bt.addBusinessMs(calendar, due, consumed));
    return { before, after, consumed };
  };
  for (const [from, to, label] of [
    ['2026-08-07T17:00:00+05:00', '2026-08-10T11:00:00+05:00', 'across a weekend'],
    ['2026-08-08T20:00:00+05:00', '2026-08-09T23:00:00+05:00', 'entirely out of hours'],
    ['2026-08-10T09:05:00+05:00', '2026-08-10T09:06:00+05:00', 'one minute inside hours'],
  ]) {
    const r = invariant(from, to);
    check(`resume returns the remaining time the pause started with (${label})`,
      r.before === r.after, `${r.before / MIN}min -> ${r.after / MIN}min after ${r.consumed / MIN}min paused`);
  }

  // §12.6's default and its two overrides.
  const wf = {
    stages: [
      { key: 'working', maps_to_status: 'in_progress' },
      { key: 'waiting_supplier', maps_to_status: 'waiting' },
    ],
    transitions: [],
  };
  check('any stage mapping to waiting pauses, with no configuration',
    sla.pausesInStage(policy, wf, 'waiting_supplier') === true);
  check('a working stage does not pause', sla.pausesInStage(policy, wf, 'working') === false);
  check('pause_on_waiting=false turns pausing off for the whole desk',
    sla.pausesInStage({ ...policy, pause_on_waiting: false }, wf, 'waiting_supplier') === false);
  check('pause_stages names the stages explicitly when it is set',
    sla.pausesInStage({ ...policy, pause_stages: ['working'] }, wf, 'waiting_supplier') === false
      && sla.pausesInStage({ ...policy, pause_stages: ['working'] }, wf, 'working') === true);
}

// ── part C: the database ──────────────────────────────────────────────────

async function cleanup() {
  const rows = await getDb()('contact_tickets')
    .where('subject', 'like', `${MARKER}%`)
    .select('id', 'document_id');
  for (const row of rows) {
    const eventIds = await getDb()(EVENTS_TABLE)
      .where({ entity_uid: TICKET_UID, document_id: row.document_id })
      .pluck('event_id');
    if (eventIds.length) {
      await getDb()(DELIVERIES_TABLE).whereIn('event_id', eventIds).delete();
      await getDb()(EVENTS_TABLE).whereIn('event_id', eventIds).delete();
    }
    await getDb()('work_item_activities')
      .where({ entity_uid: TICKET_UID, target_document_id: row.document_id })
      .delete();
    await getDb()('helpdesk_ticket_messages').where('ticket_id', row.id).delete();
    await documents(TICKET_UID).delete({ documentId: row.document_id });
  }
  sla.invalidate();
  return rows.length;
}

function countEvents(documentId, eventName) {
  return getDb()(EVENTS_TABLE)
    .where({ entity_uid: TICKET_UID, document_id: documentId, event_name: eventName })
    .count('id as total')
    .first()
    .then((row) => Number(row.total));
}

function readTicket(id) {
  return getDb()('contact_tickets').where('id', id).first();
}

async function partC() {
  console.log('\nC. database (marker ticket)');

  const desk = await getDb()('helpdesk_desks').where('key', 'customer_support').first('id');
  const calendarRow = await getDb()('helpdesk_business_calendars').where('key', 'standard').first('id');
  const policyRow = await getDb()('helpdesk_sla_policies').where('key', 'standard').first('id');
  if (!desk || !calendarRow || !policyRow) {
    check('seeded helpdesk configuration is present', false,
      'run: node scripts/migrate.js up (migrations 010-016)');
    return;
  }

  const calendar = await sla.loadCalendar(calendarRow.id);
  check('the seeded calendar loads and normalizes', Boolean(calendar));
  check('it carries the calendar\'s own timezone', calendar && calendar.timezone === 'Asia/Karachi',
    calendar && calendar.timezone);
  check('the seeded Friday has two shifts', calendar && calendar.days[5].length === 2);

  const policy = await sla.loadPolicy(policyRow.id);
  check('the seeded policy loads with a target per priority',
    policy && Object.keys(policy.targets).length === 4, policy && Object.keys(policy.targets).join(','));
  const target = policy.targets.urgent;
  check('urgent promises a 30-minute first response',
    target && target.first_response_ms === 30 * MIN, target && target.first_response_ms / MIN);
  check('escalation steps parse and sort by threshold',
    target.escalation_steps.length > 0
      && target.escalation_steps.every((s, i, all) => i === 0 || all[i - 1].at_pct <= s.at_pct),
    JSON.stringify(target.escalation_steps.map((s) => s.key)));

  // Resolution order and the two ways out of it, all read-only.
  const synthetic = { desk_id: desk.id, priority: 'urgent', is_imported: false, sla_policy_id: null };
  const resolved = await sla.resolveContext(synthetic);
  check('a ticket resolves desk → policy → calendar → target', Boolean(resolved && resolved.target));
  check('an imported ticket is never measured (F12)',
    (await sla.resolveContext({ ...synthetic, is_imported: true })) === null);
  check('a priority the policy makes no promise about is indeterminate, not compliant',
    (await sla.resolveContext({ ...synthetic, priority: '__none__' })) === null);

  // ── the marker ticket ───────────────────────────────────────────────────
  const created = await documents(TICKET_UID).create({
    data: {
      subject: `${MARKER} do not action`,
      message: 'Marker row written by scripts/smoke-sla.js. Deleted by the same script.',
      status: 'open',
      priority: 'urgent',
      desk_id: desk.id,
      source: 'api',
      requester_kind: 'system',
      is_imported: false,
      reopened_count: 0,
    },
  });
  check('marker ticket created', Boolean(created && created.documentId));
  if (!created) return;

  const first = await sla.recomputeFor(created.documentId);
  let row = await readTicket(created.id);
  check('recompute pins the policy at creation', Number(row.sla_policy_id) === policyRow.id, row.sla_policy_id);
  check('recompute sets both targets',
    Boolean(row.first_response_due_at) && Boolean(row.resolution_due_at));
  check('the legacy sla_due_at is kept in sync with the resolution target',
    row.sla_due_at && new Date(row.sla_due_at).getTime() === new Date(row.resolution_due_at).getTime());
  check('a fresh ticket is ok', row.sla_state === OK, `${row.sla_state} (${JSON.stringify(first)})`);

  // The TicketService seam: a column patch, computed without writing, so it can
  // commit inside the caller's own transaction.
  const createPatch = await sla.targetsForCreate(null, { ...row, sla_policy_id: null }, { desk });
  check('targetsForCreate returns a column patch with the policy pinned',
    Number(createPatch.sla_policy_id) === policyRow.id && createPatch.sla_state === OK
      && createPatch.resolution_due_at instanceof Date,
    JSON.stringify({ policy: createPatch.sla_policy_id, state: createPatch.sla_state }));
  check('and mirrors the legacy column so the storefront flow keeps working',
    createPatch.sla_due_at instanceof Date
      && createPatch.sla_due_at.getTime() === createPatch.resolution_due_at.getTime());
  check('targetsForCreate never throws on an unmeasurable ticket — intake cannot fail (F1)',
    (await sla.targetsForCreate(null, { ...row, priority: '__none__' }, { desk })).sla_state === 'indeterminate');

  // Rather than waiting four business hours, move the promise into the past.
  const overdue = new Date(Date.now() - MIN);
  await getDb()('contact_tickets').where('id', created.id).update({
    first_response_due_at: overdue,
    resolution_due_at: overdue,
    sla_due_at: overdue,
  });

  const expectedBreaches = [target.first_response_ms, target.resolution_ms].filter((v) => v !== null).length;
  const expectedEscalations = target.escalation_steps.filter((s) => s.at_pct <= 100).length;

  // One batch of one, starting immediately before the marker: the sweep is
  // scoped so tightly that it cannot reach a real ticket even if one qualifies.
  // stats.truncated comes back true as a result, which is the expected cost.
  const sweepOptions = { afterId: created.id - 1, batchSize: 1, maxBatches: 1 };
  const pass1 = await sla.sweep(sweepOptions);
  row = await readTicket(created.id);
  check('the sweep considered exactly the marker', pass1.scanned === 1, JSON.stringify(pass1));
  check('the sweep materialises the breach on the ticket', row.sla_state === 'breached', row.sla_state);
  check('the sweep never writes status', row.status === 'open', row.status);
  check('one breach event per clock',
    (await countEvents(created.documentId, 'helpdesk.sla.breached')) === expectedBreaches,
    `${await countEvents(created.documentId, 'helpdesk.sla.breached')} vs ${expectedBreaches}`);
  check('escalation steps at or below the elapsed percentage fired',
    (await countEvents(created.documentId, 'helpdesk.sla.escalated')) === expectedEscalations,
    `${await countEvents(created.documentId, 'helpdesk.sla.escalated')} vs ${expectedEscalations}`);

  const pass2 = await sla.sweep(sweepOptions);
  check('a second pass announces nothing — deduped, not once per sweep',
    pass2.breached === 0 && pass2.at_risk === 0 && pass2.escalated === 0, JSON.stringify(pass2));
  check('and changes no state', pass2.updated === 0);
  check('the breach count is still one per clock',
    (await countEvents(created.documentId, 'helpdesk.sla.breached')) === expectedBreaches);

  // ── first response is stamped once ──────────────────────────────────────
  const stamp = await sla.stampFirstResponse(created.documentId, new Date());
  check('the first public agent message stamps the clock', stamp.stamped === true);
  const second = await sla.stampFirstResponse(created.documentId, new Date(Date.now() + HOUR));
  check('a second stamp is refused', second.stamped === false);
  check('and does not move the instant',
    new Date(second.first_response_at).getTime() === new Date(stamp.first_response_at).getTime(),
    `${second.first_response_at} vs ${stamp.first_response_at}`);

  // ── pause and resume ────────────────────────────────────────────────────
  const paused = await sla.pause(created.documentId, 'awaiting the requester');
  row = await readTicket(created.id);
  check('pause stamps sla_paused_at', paused.changed === true && Boolean(row.sla_paused_at));
  check('pause emits its event', (await countEvents(created.documentId, 'helpdesk.sla.paused')) === 1);
  check('a breached ticket stays breached while paused — breach outranks paused',
    row.sla_state === 'breached', row.sla_state);
  check('pausing twice is a no-op', (await sla.pause(created.documentId, 'again')).changed === false);

  // Backdate the pause so the resume push-out is a number worth checking.
  //
  // Both instants are pinned to the CALENDAR, not the wall clock, and `now` is
  // injected rather than read. Backdating three wall-clock hours from whenever
  // the suite happens to run makes this assertion time-of-day dependent: run it
  // at midnight and the whole window falls outside the 09:00-18:00 working day,
  // business-elapsed is legitimately 0, nothing is pushed out, and a correct
  // implementation fails. Deriving `now` forward from a working instant makes
  // the three business hours true by construction, at any hour, on any day.
  const pausedAt = bt.addBusinessMs(calendar, new Date(Date.now() - 14 * 24 * HOUR), 0);
  const resumeNow = bt.addBusinessMs(calendar, pausedAt, 3 * HOUR);
  await getDb()('contact_tickets').where('id', created.id).update({ sla_paused_at: pausedAt });
  const dueBeforeResume = new Date((await readTicket(created.id)).resolution_due_at);
  const resumed = await sla.resume(created.documentId, { now: resumeNow });
  row = await readTicket(created.id);
  const expectedPause = bt.elapsedBusinessMs(calendar, pausedAt, resumeNow);
  check('resume clears the pause stamp', resumed.changed === true && row.sla_paused_at === null);
  check('resume accumulates the pause in business milliseconds',
    Math.abs(Number(row.sla_paused_ms) - expectedPause) < MIN,
    `${Number(row.sla_paused_ms)} vs ~${expectedPause}`);
  check('resume pushes the resolution target out by the same amount',
    Math.abs(new Date(row.resolution_due_at).getTime()
      - bt.addBusinessMs(calendar, dueBeforeResume, Number(row.sla_paused_ms)).getTime()) < MIN,
    pkt(row.resolution_due_at));
  check('resume emits its event', (await countEvents(created.documentId, 'helpdesk.sla.resumed')) === 1);
  check('resuming twice is a no-op', (await sla.resume(created.documentId)).changed === false);

  // ── F5: a policy change may not breach a compliant ticket ───────────────
  const future = new Date(Date.now() + 24 * HOUR);
  await getDb()('contact_tickets').where('id', created.id).update({
    // The ticket is compliant on BOTH clocks: its promises are a day away and
    // the first response has already landed inside its target. Its created_at is
    // a month old, so recomputing from the policy would land the resolution
    // target deep in the past. Leaving the earlier backdated first-response due
    // in place would have kept the ticket breached on that clock and made the
    // assertion below prove nothing.
    first_response_due_at: future,
    resolution_due_at: future,
    sla_due_at: future,
    created_at: new Date(Date.now() - 30 * 24 * HOUR),
  });
  sla.invalidate();
  const recomputed = await sla.recomputeFor(created.documentId);
  row = await readTicket(created.id);
  check('a recompute does not move a compliant target into the past (F5)',
    Math.abs(new Date(row.resolution_due_at).getTime() - future.getTime()) < 1000,
    `${pkt(row.resolution_due_at)} vs ${pkt(future)}`);
  check('and the ticket is not retroactively breached',
    row.sla_state !== 'breached', `${row.sla_state} (${JSON.stringify(recomputed)})`);

  // ── reopen restarts the resolution clock only ──────────────────────────
  const firstResponseBefore = new Date((await readTicket(created.id)).first_response_at);
  await sla.recomputeFor(created.documentId, { restart: true, reason: 'reopen' });
  row = await readTicket(created.id);
  check('first_response_at survives a reopen (RULE-18)',
    new Date(row.first_response_at).getTime() === firstResponseBefore.getTime(),
    `${row.first_response_at} vs ${firstResponseBefore.toISOString()}`);
  check('the resolution clock restarts into the future',
    new Date(row.resolution_due_at).getTime() > Date.now());
  check('and the accumulated pause is reset with it', Number(row.sla_paused_ms) === 0, row.sla_paused_ms);
  check('the restart is audited',
    (await countEvents(created.documentId, 'helpdesk.sla.recomputed')) >= 1);

  // The same restart through the seam TicketService actually calls, which must
  // hand back a patch rather than writing inside somebody else's transaction.
  const beforeSeam = await readTicket(created.id);
  const reopenPatch = await sla.onStatusChanged(null, created.documentId, {
    fromStatus: 'closed', toStatus: 'open', stage: { key: 'triaged', maps_to_status: 'open', is_paused: false }, desk,
  });
  check('onStatusChanged returns a restart patch on reopen',
    reopenPatch && reopenPatch.resolution_due_at instanceof Date
      && reopenPatch.resolution_due_at.getTime() > Date.now(),
    JSON.stringify(reopenPatch));
  check('and never touches first_response_at',
    reopenPatch && !('first_response_at' in reopenPatch), Object.keys(reopenPatch || {}).join(','));
  // Comparing the stored row before and after, not the patch against the row:
  // a restart computed out of hours lands on the same next-working-minute as the
  // previous one, so "the value differs" would be a coin flip.
  const afterSeam = await readTicket(created.id);
  check('and writes nothing itself — the caller owns the transaction',
    ['resolution_due_at', 'sla_due_at', 'sla_paused_at', 'sla_paused_ms', 'sla_state']
      .every((c) => String(beforeSeam[c]) === String(afterSeam[c])),
    JSON.stringify({ before: beforeSeam.sla_state, after: afterSeam.sla_state }));
  const pausePatch = await sla.onStatusChanged(null, created.documentId, {
    fromStatus: 'in_progress',
    toStatus: 'waiting',
    stage: { key: 'waiting_customer', maps_to_status: 'waiting', is_paused: true },
    desk,
  });
  check('onStatusChanged pauses on a stage that maps to waiting',
    pausePatch && pausePatch.sla_paused_at instanceof Date, JSON.stringify(pausePatch));

  // ── extend refuses what it must ────────────────────────────────────────
  const refuses = async (fn) => {
    try { await fn(); return null; } catch (err) { return err.name; }
  };
  check('extend refuses a missing reason',
    (await refuses(() => sla.extend(null, created.documentId, new Date(Date.now() + 48 * HOUR), '   ')))
      === 'ValidationError');
  check('extend refuses a system actor — extending a promise is a management act',
    (await refuses(() => sla.extend(null, created.documentId, new Date(Date.now() + 48 * HOUR), 'because')))
      === 'ForbiddenError');

  // ── the read model ─────────────────────────────────────────────────────
  const detail = await sla.detailFor(null, created.documentId);
  check('detailFor reports both clocks and the policy behind them',
    detail.measured === true && detail.policy.key === 'standard'
      && detail.calendar.timezone === 'Asia/Karachi'
      && detail.first_response.at !== null,
    JSON.stringify({ measured: detail.measured, policy: detail.policy && detail.policy.key }));
}

/**
 * Parts A and B run first and unconditionally. They are §12's acceptance
 * criteria and they need no database, so a machine without one still gets the
 * answer that matters most; only part C depends on the migrations having run.
 */
async function databaseReady() {
  for (const table of ['contact_tickets', 'helpdesk_desks', 'helpdesk_sla_policies',
    'helpdesk_sla_targets', 'helpdesk_business_calendars', 'helpdesk_holidays', EVENTS_TABLE]) {
    if (!(await getDb().schema.hasTable(table))) {
      console.log(`  SKIP  ${table} does not exist — run: node scripts/migrate.js up`);
      return false;
    }
  }
  if (!(await getDb().schema.hasColumn('contact_tickets', 'resolution_due_at'))) {
    console.log('  SKIP  contact_tickets has no resolution_due_at — run: node scripts/migrate.js up');
    return false;
  }
  return true;
}

async function main() {
  partA();
  partB();

  console.log('');
  let ready = false;
  try {
    ready = await databaseReady();
  } catch (err) {
    console.log(`  SKIP  database unavailable (${err.message})`);
  }
  // A skipped part C is reported, never counted as a pass: the run says what it
  // did and did not prove.
  if (!ready) {
    console.log('  part C (database) skipped — parts A and B still ran');
    return failures;
  }

  const stale = await cleanup();
  if (stale) console.log(`  (cleared ${stale} marker ticket(s) left by an earlier run)`);
  try {
    await partC();
  } finally {
    await cleanup();
  }
  return failures;
}

main()
  .then(async (code) => {
    console.log(failures === 0 ? '\nSLA SMOKE: all checks passed' : `\nSLA SMOKE: ${failures} check(s) FAILED`);
    await closeDb();
    process.exit(code === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error('sla smoke failed:', err);
    try { await cleanup(); } catch { /* the DB is already unhappy — nothing to add */ }
    await closeDb();
    process.exit(2);
  });
