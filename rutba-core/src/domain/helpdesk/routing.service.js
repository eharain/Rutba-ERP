'use strict';

/**
 * AssignmentService — get every ticket to the right person, and never lose one
 * doing it (spec 14).
 *
 * THE ONE INVARIANT: ROUTING NEVER FAILS A TICKET. Every selection path in this
 * file runs inside a try/catch whose failure branch is "leave it unassigned in
 * the desk queue and tell the manager". A ticket that cannot be routed must
 * still exist (§03 F1), and route() is called from inside TicketService.create's
 * transaction — so a throw here would roll back the ticket itself, turning a
 * routing problem into data loss. The catch is deliberately total, including the
 * eligibility fact-gathering: the alternative, swallowing individual checks so
 * the rest can proceed, would let the leave check silently stop running, which
 * is the exact failure §14.4 warns about. Better to assign nobody and say why
 * than to assign somebody on annual leave.
 *
 * THE PIPELINE (§14.2), in order, each step falling through to the next:
 *   1. DESK    explicit > catalog item > rule > keyword > tenant default  (DeskService)
 *   2. TEAM    rule target > desk default > skill match > branch match
 *   3. AGENT   the desk's strategy, filtered by eligibility
 *   4. FALLBACK unassigned + helpdesk.ticket.routing_failed
 *
 * A STRATEGY PROPOSES, ELIGIBILITY DISPOSES. checkEligibility is synchronous and
 * pure over facts loaded up front — the same reasoning as policy/entitlement.js
 * `can()`: an async predicate is one somebody eventually forgets to await, and
 * `if (eligible(...))` on a pending Promise is always true. It also evaluates
 * every check rather than short-circuiting, because /routing/preview exists to
 * show WHY, and a report that stops at the first failure answers half the
 * question.
 *
 * CLAIM IS A COMPARE-AND-SET, and the reason it is written the way it is:
 * `assigned_to` is a Strapi 5 relation, so it lives in
 * contact_tickets_assigned_to_lnk, whose only unique index is on
 * (contact_ticket_id, user_id) — it stops one user being linked twice and does
 * NOT stop two different users being linked to the same ticket. There is no
 * column to compare-and-set and no unique constraint to lose a race against. So
 * the CAS is a conditional UPDATE of the TICKET row guarded by
 * `NOT EXISTS (link row)`: the ticket row is the thing both claimants must lock
 * exclusively, the guard is re-evaluated after the lock is granted, and the
 * loser's UPDATE affects zero rows. The link INSERT then happens under that same
 * lock, inside the same transaction. Read-then-write would produce exactly the
 * silent double-assignment §14.6 calls the commonest race in any desk product.
 *
 * WHAT THE DELIVERED SCHEMA DOES NOT HAVE, and how each gap is handled — all in
 * one place because "why did nobody get picked?" is the question this file will
 * be asked most:
 *   - helpdesk_routing_rules DOES NOT EXIST YET. Migration 014 deliberately
 *     stopped short of the tables belonging to engines not yet built, and rules
 *     are this engine's. Every read below probes for the table and treats its
 *     absence as "no rules configured", which is a correct degradation rather
 *     than a workaround: rules only add condition-based overrides, and the desk
 *     default path is fully functional without them. The DDL the repository
 *     expects is documented at ROUTING_RULE_COLUMNS below so the migration that
 *     creates it has nothing to guess.
 *   - No max_open_tickets column. The cap is derived from
 *     helpdesk_team_members.capacity_weight (100 = a full share) against a
 *     tenant default, so a part-time agent at 50 carries half the load and an
 *     agent parked at 0 is never routed to — which is a useful thing to be able
 *     to do without a schema change. An explicit per-member column overrides it
 *     the day it exists.
 *   - No per-agent skills, languages, capabilities or branch scope. Team-level
 *     skills exist; the rest are read off the membership row if the columns ever
 *     appear (candidates are selected with `m.*` precisely so they arrive
 *     automatically). Until then the strategies that key on them find no
 *     evidence and DO NOT narrow — absence of data is not evidence of
 *     unsuitability, and narrowing on it would empty the pool. The branch gap is
 *     the same one policy/entitlement.js documents for branchIds; there is no
 *     user→branch mapping anywhere in Core.
 *
 * WHO MAY TRIGGER ROUTING. route() requires ticket.assign or the system band.
 * Automatic routing at intake must therefore be invoked with a SYSTEM actor
 * (entitlement.systemActor), not the requester's: the assignment is the desk's
 * decision, not the requester's, and passing the requester through would either
 * deny every intake or force ticket.assign into the requester band.
 */

const { getDb, withTransaction } = require('../../db/connection');
const { generateDocumentId } = require('../../documents/write');
const { emit } = require('../../platform/events');
const { get } = require('../../config/env');
const { explain, validate: validateConditions } = require('./conditions');
const { normalizeCalendar, isWorkingTime } = require('./business-time');
const deskService = require('./desk.service');
const ticketRepo = require('./repository/ticket.repo');
const { assertCan, hasBand, eventActor, ForbiddenError } = require('./policy/entitlement');

const TICKETS = 'contact_tickets';
const ASSIGNEE_LNK = 'contact_tickets_assigned_to_lnk';
const TEAMS = 'helpdesk_teams';
const TEAM_MEMBERS = 'helpdesk_team_members';
const RULES = 'helpdesk_routing_rules';
const CALENDARS = 'helpdesk_business_calendars';
const HOLIDAYS = 'helpdesk_holidays';
const USERS = 'up_users';
const LEAVE_REQUESTS = 'hr_leave_requests';
const LEAVE_EMPLOYEE_LNK = 'hr_leave_requests_employee_lnk';
const EMPLOYEE_USER_LNK = 'hr_employees_user_lnk';
const PERSON_USER_LNK = 'persons_user_lnk';
const PERSON_LNK = 'contact_tickets_person_lnk';
const USER_LNK = 'contact_tickets_user_lnk';
const EMPLOYEE_LNK = 'contact_tickets_employee_lnk';

const TICKET_UID = 'api::contact-ticket.contact-ticket';

/**
 * The DDL helpdesk_routing_rules is expected to have (spec 14.7). Written down
 * here rather than left implicit because the table does not exist yet and the
 * migration that creates it must match this repository exactly.
 *
 *   id, document_id, key, name,
 *   desk_id            null = tenant-wide, and the only rules considered when
 *                      resolving the DESK itself (a desk-scoped rule cannot
 *                      decide which desk applies)
 *   sequence           first match wins, ascending
 *   conditions         json, the ./conditions expression tree
 *   strategy           null = inherit the desk's
 *   target_desk_id, target_team_id, target_agent_id
 *   is_active, created_at, updated_at
 */
const ROUTING_RULE_COLUMNS = Object.freeze([
  'id', 'document_id', 'key', 'name', 'desk_id', 'sequence', 'conditions',
  'strategy', 'target_desk_id', 'target_team_id', 'target_agent_id',
  'is_active', 'created_at', 'updated_at',
]);

const STRATEGIES = Object.freeze([
  'round_robin', 'least_busy', 'least_busy_weighted', 'skill_based',
  'branch_based', 'language_based', 'load_balanced', 'manual', 'sticky',
  'ai_assisted',
]);

/**
 * §22 owns the model call. The strategy is listed and accepted so a desk can be
 * configured for it today without the configuration being rejected, and it
 * degrades to the composite default with `strategy_unavailable` in the trace —
 * visibly unimplemented rather than silently ignored. When the AI service seam
 * lands, this constant is the whole hook: resolve a suggestion, then run it
 * through the SAME eligibility filter as every other strategy (§14.3).
 */
const AI_STRATEGY = 'ai_assisted';

/**
 * Three-way, and the distinction matters. TERMINAL is "stopped moving"
 * (DeskService owns the list). LOAD_STATUSES is what counts against an agent's
 * cap. `resolved` is in neither: it can still be reopened, so it is not
 * terminal, but it is off the agent's desk until the auto-close sweep runs
 * (§7.5 auto_close_after_days) — counting it would block an agent for a week
 * behind work they have already finished.
 */
const LOAD_STATUSES = Object.freeze(['open', 'in_progress', 'waiting']);

/** Unknown priorities weight as `normal`, never as zero — an unconfigured priority must not be free. */
const PRIORITY_WEIGHT = Object.freeze({ low: 1, normal: 2, high: 3, urgent: 5 });
const DEFAULT_PRIORITY_WEIGHT = 2;

const DEFAULT_MAX_OPEN = Number(get('RUTBA_HELPDESK_MAX_OPEN_TICKETS', '20')) || 20;
const DEFAULT_STRATEGY = String(get('RUTBA_HELPDESK_ROUTING_STRATEGY', 'load_balanced'));
const CALENDAR_CACHE_MS = Number(get('RUTBA_HELPDESK_CALENDAR_CACHE_MS', '60000')) || 60000;

class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}

class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; }
}

/** 409 is not in the server's name→status map, so it is carried explicitly. */
class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
  }
}

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function toId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return false;
  return value === 1 || value === '1' || value === 'true';
}

function toStringSet(...sources) {
  const out = new Set();
  for (const source of sources) {
    const list = Array.isArray(source) ? source : (typeof source === 'string' ? [source] : []);
    for (const item of list) {
      const text = String(item === null || item === undefined ? '' : item).trim().toLowerCase();
      if (text) out.add(text);
    }
  }
  return out;
}

function intersects(a, b) {
  for (const item of a) if (b.has(item)) return true;
  return false;
}

// ── table probing ─────────────────────────────────────────────────────────

const tableProbe = new Map();

/**
 * Cached per process. A table cannot appear and disappear inside a run, and the
 * probe is on the hot path of every route() — but the cache is per table name,
 * so a migration applied while the process is up needs a restart to be seen. That
 * is the same contract as the rest of the schema.
 */
async function tableExists(name) {
  if (tableProbe.has(name)) return tableProbe.get(name);
  const exists = await getDb().schema.hasTable(name);
  tableProbe.set(name, exists);
  return exists;
}

// ── routing rules (§14.7) ─────────────────────────────────────────────────

async function listRuleRows(filter = {}) {
  if (!(await tableExists(RULES))) return [];
  const qb = getDb()(RULES).where('is_active', true);
  if (filter.deskScope === 'tenant') qb.whereNull('desk_id');
  else if (filter.deskId !== undefined && filter.deskId !== null) {
    // A desk's own rules plus the tenant-wide ones, so a catch-all does not have
    // to be duplicated onto every desk.
    qb.where(function deskOrTenant() { this.where('desk_id', filter.deskId).orWhereNull('desk_id'); });
  }
  const rows = await qb.orderBy('sequence', 'asc').orderBy('id', 'asc').select(ROUTING_RULE_COLUMNS);
  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    documentId: row.document_id,
    conditions: parseJson(row.conditions),
    is_active: toBoolean(row.is_active),
  }));
}

/**
 * First matching rule wins; a rule with empty conditions matches everything and
 * is the catch-all (§14.7). Returns the rule AND its explanation, because
 * /routing/preview has to be able to show the near misses too.
 */
function matchRules(rules, context) {
  const evaluated = [];
  let matched = null;
  for (const rule of rules) {
    const trace = explain(rule.conditions, context);
    evaluated.push({
      ruleId: rule.id,
      name: rule.name || rule.key || `#${rule.id}`,
      sequence: rule.sequence,
      matched: trace.result,
      trace,
    });
    if (trace.result && !matched) matched = rule;
  }
  return { matched, evaluated };
}

/**
 * The rule step of DESK resolution (§14.2 step 1). Only tenant-scoped rules that
 * nominate a target desk are considered: a rule scoped to a desk cannot decide
 * which desk a ticket belongs to without begging the question.
 */
async function matchDeskRule(input = {}) {
  const rules = (await listRuleRows({ deskScope: 'tenant' })).filter((r) => toId(r.target_desk_id));
  if (!rules.length) return null;
  const { matched } = matchRules(rules, buildConditionContext(input));
  if (!matched) return null;
  return { deskId: toId(matched.target_desk_id), rule: matched };
}

async function listRoutingRules(actor, filter = {}) {
  if (!deskService.canReadConfig(actor)) throw new ForbiddenError('Not permitted: helpdesk.routing.configure');
  return listRuleRows(filter);
}

async function assertRulesTable() {
  if (await tableExists(RULES)) return;
  throw new ValidationError(
    `${RULES} does not exist yet — routing rules are configuration for an engine whose table `
    + 'ships with it (see ROUTING_RULE_COLUMNS). Routing runs on desk defaults until then.'
  );
}

function normalizeRuleInput(patch, current) {
  const out = {};
  if ('name' in patch) out.name = String(patch.name || '').trim();
  if ('key' in patch) out.key = String(patch.key || '').trim().toLowerCase() || null;
  if ('desk_id' in patch || 'deskId' in patch) out.desk_id = toId(patch.desk_id !== undefined ? patch.desk_id : patch.deskId);
  if ('sequence' in patch) {
    const n = Number(patch.sequence);
    if (!Number.isInteger(n) || n < 0) throw new ValidationError('sequence must be a non-negative integer');
    out.sequence = n;
  }
  if ('conditions' in patch) {
    // Strict validation on SAVE, so a broken rule is rejected in front of the
    // admin who wrote it rather than silently matching nothing at 3am.
    validateConditions(patch.conditions);
    out.conditions = patch.conditions === undefined ? null : patch.conditions;
  }
  if ('strategy' in patch) {
    const strategy = patch.strategy === null ? null : String(patch.strategy).trim();
    if (strategy && !STRATEGIES.includes(strategy)) {
      throw new ValidationError(`Unknown strategy "${strategy}" — expected one of ${STRATEGIES.join(', ')}`);
    }
    out.strategy = strategy || null;
  }
  for (const column of ['target_desk_id', 'target_team_id', 'target_agent_id']) {
    if (column in patch) out[column] = patch[column] === null ? null : toId(patch[column]);
  }
  if ('is_active' in patch) out.is_active = toBoolean(patch.is_active);
  if (!current && !out.name) throw new ValidationError('A routing rule needs a name');
  return out;
}

async function createRoutingRule(actor, input = {}) {
  if (!deskService.canManageConfig(actor)) throw new ForbiddenError('Not permitted: helpdesk.routing.configure');
  await assertRulesTable();
  const patch = normalizeRuleInput(input, null);
  const now = new Date();
  const row = {
    document_id: generateDocumentId(),
    key: patch.key === undefined ? null : patch.key,
    name: patch.name,
    desk_id: patch.desk_id === undefined ? null : patch.desk_id,
    sequence: patch.sequence === undefined ? 100 : patch.sequence,
    conditions: JSON.stringify(patch.conditions === undefined ? null : patch.conditions),
    strategy: patch.strategy === undefined ? null : patch.strategy,
    target_desk_id: patch.target_desk_id === undefined ? null : patch.target_desk_id,
    target_team_id: patch.target_team_id === undefined ? null : patch.target_team_id,
    target_agent_id: patch.target_agent_id === undefined ? null : patch.target_agent_id,
    is_active: patch.is_active === undefined ? true : patch.is_active,
    created_at: now,
    updated_at: now,
  };
  const [id] = await getDb()(RULES).insert(row);
  await emit({
    eventName: 'helpdesk.routing_rule.created',
    actor: eventActor(actor),
    payload: { ruleId: id, name: row.name, deskId: row.desk_id },
  });
  return { ...row, id, conditions: patch.conditions === undefined ? null : patch.conditions };
}

async function updateRoutingRule(actor, ruleId, input = {}) {
  if (!deskService.canManageConfig(actor)) throw new ForbiddenError('Not permitted: helpdesk.routing.configure');
  await assertRulesTable();
  const id = toId(ruleId);
  const current = id ? await getDb()(RULES).where('id', id).first(ROUTING_RULE_COLUMNS) : null;
  if (!current) throw new NotFoundError(`No such routing rule: ${ruleId}`);

  const patch = normalizeRuleInput(input, current);
  const write = { ...patch, updated_at: new Date() };
  if ('conditions' in write) write.conditions = JSON.stringify(write.conditions);
  await getDb()(RULES).where('id', id).update(write);
  await emit({
    eventName: 'helpdesk.routing_rule.updated',
    actor: eventActor(actor),
    payload: { ruleId: id, changes: Object.keys(patch) },
  });
  return getDb()(RULES).where('id', id).first(ROUTING_RULE_COLUMNS);
}

// ── the condition namespace (shared with automation, §13) ─────────────────

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * The fact set a rule may address. Documented as a namespace rather than "the
 * ticket row" because rule authors write these paths by hand and a field that
 * silently resolves to MISSING reads as a rule that "does not work":
 *
 *   subject · message · status · stage_key · priority · source · requester_kind ·
 *   category · tags[] · custom_fields.* · desk_id · desk_key · branch_id ·
 *   team_id · catalog_item_id · is_imported · created_at
 *   requester.kind · requester.person_id · requester.user_id · requester.employee_id ·
 *   requester.email · requester.is_employee
 *   subject_entity.uid · subject_entity.document_id
 *   now.iso · now.date · now.hour · now.minute · now.weekday
 *
 * The evaluator never reads a clock (see ./conditions), so `now` is put here by
 * the caller — which is what makes a rule's behaviour reproducible in a test.
 */
function buildConditionContext(source = {}, extra = {}) {
  const at = extra.at instanceof Date ? extra.at : new Date();
  const tags = parseJson(source.tags) || [];
  const customFields = parseJson(source.custom_fields || source.customFields) || {};
  return {
    subject: source.subject === undefined ? null : source.subject,
    message: source.message === undefined ? null : source.message,
    status: source.status === undefined ? null : source.status,
    stage_key: source.stage_key === undefined ? null : source.stage_key,
    priority: source.priority === undefined ? null : source.priority,
    source: source.source === undefined ? null : source.source,
    requester_kind: source.requester_kind || source.requesterKind || null,
    category: source.category === undefined ? null : source.category,
    tags: Array.isArray(tags) ? tags : [],
    custom_fields: customFields,
    desk_id: source.desk_id === undefined ? (source.deskId === undefined ? null : source.deskId) : source.desk_id,
    desk_key: extra.deskKey || source.desk_key || source.deskKey || null,
    branch_id: source.branch_id === undefined ? (source.branchId === undefined ? null : source.branchId) : source.branch_id,
    team_id: source.team_id === undefined ? null : source.team_id,
    catalog_item_id: source.catalog_item_id === undefined
      ? (source.catalogItemId === undefined ? null : source.catalogItemId)
      : source.catalog_item_id,
    is_imported: toBoolean(source.is_imported),
    created_at: source.created_at || source.createdAt || null,
    requester: {
      kind: source.requester_kind || source.requesterKind || null,
      person_id: source.person_id === undefined ? null : source.person_id,
      user_id: source.user_id === undefined ? null : source.user_id,
      employee_id: source.employee_id === undefined ? null : source.employee_id,
      email: source.requester_email || source.email || null,
      is_employee: Boolean(source.employee_id),
    },
    subject_entity: {
      uid: source.subject_entity_uid || null,
      document_id: source.subject_document_id || null,
    },
    now: {
      iso: at.toISOString(),
      date: at.toISOString().slice(0, 10),
      hour: at.getUTCHours(),
      minute: at.getUTCMinutes(),
      weekday: WEEKDAYS[at.getUTCDay()],
    },
  };
}

// ── tickets ───────────────────────────────────────────────────────────────

const TICKET_COLUMNS = [
  't.id', 't.document_id', 't.ticket_no', 't.subject', 't.message', 't.status',
  't.stage_key', 't.priority', 't.source', 't.requester_kind', 't.category',
  't.desk_id', 't.team_id', 't.branch_id', 't.catalog_item_id', 't.custom_fields',
  't.tags', 't.subject_entity_uid', 't.subject_document_id', 't.is_imported',
  't.archived_at', 't.created_at', 't.updated_at',
];

/**
 * Every identity on a ticket is a Strapi relation, so the four link tables are
 * joined here and flattened to `*_id` — the shape policy/entitlement.js reads
 * (`assigned_to_id`, `person_id`, `user_id`, `employee_id`).
 */
function ticketQuery() {
  return getDb()(`${TICKETS} as t`)
    .leftJoin(`${ASSIGNEE_LNK} as a`, 'a.contact_ticket_id', 't.id')
    .leftJoin(`${PERSON_LNK} as p`, 'p.contact_ticket_id', 't.id')
    .leftJoin(`${USER_LNK} as u`, 'u.contact_ticket_id', 't.id')
    .leftJoin(`${EMPLOYEE_LNK} as e`, 'e.contact_ticket_id', 't.id')
    .select([
      ...TICKET_COLUMNS,
      'a.user_id as assigned_to_id',
      'p.person_id as person_id',
      'u.user_id as user_id',
      'e.hr_employee_id as employee_id',
    ]);
}

function mapTicket(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    documentId: row.document_id,
    tags: parseJson(row.tags) || [],
    custom_fields: parseJson(row.custom_fields) || {},
    desk_id: toId(row.desk_id),
    team_id: toId(row.team_id),
    branch_id: toId(row.branch_id),
    assigned_to_id: toId(row.assigned_to_id),
    person_id: toId(row.person_id),
    user_id: toId(row.user_id),
    employee_id: toId(row.employee_id),
    is_imported: toBoolean(row.is_imported),
  };
}

async function loadTicket(ref) {
  if (!ref) return null;
  if (typeof ref === 'object' && ref.id && ref.assigned_to_id !== undefined) return ref;
  const key = typeof ref === 'object' ? (ref.id || ref.documentId || ref.document_id) : ref;
  const numeric = toId(key);
  const row = await ticketQuery()
    .where(numeric ? 't.id' : 't.document_id', numeric || String(key))
    .first();
  return mapTicket(row);
}

async function requireTicket(ref) {
  const ticket = await loadTicket(ref);
  if (!ticket) throw new NotFoundError(`No such ticket: ${typeof ref === 'object' ? ref.id || ref.documentId : ref}`);
  return ticket;
}

// ── calendars ─────────────────────────────────────────────────────────────

const calendarCache = new Map();

/**
 * The row AND its holidays are cached alongside the normalized calendar, because
 * a team calendar has to be rebuilt from the same inputs. Reconstructing it from
 * the normalized form instead loses every RECURRING holiday — normalizeCalendar
 * keeps those as bare MM-DD in a separate set, and every holiday the helpdesk
 * seed ships is recurring, so a team with its own hours would quietly work
 * through Independence Day.
 */
async function loadCalendarSource(calendarId) {
  const id = toId(calendarId);
  if (!id) return null;
  const hit = calendarCache.get(id);
  if (hit && Date.now() - hit.at < CALENDAR_CACHE_MS) return hit.source;

  const row = await getDb()(CALENDARS).where('id', id).first('*');
  if (!row) return null;
  const holidays = await getDb()(HOLIDAYS).where('calendar_id', id).select('holiday_date', 'is_recurring');
  const source = {
    row,
    holidays,
    calendar: normalizeCalendar({ ...row, working_days: parseJson(row.working_days), holidays }),
  };
  calendarCache.set(id, { at: Date.now(), source });
  return source;
}

/**
 * A team may declare its own working_hours in the calendar's `working_days`
 * shape (migration 014 says so explicitly). When it does, the team's hours are
 * overlaid on the desk calendar's timezone and holidays — a night-shift team
 * still observes Eid.
 */
async function resolveWorkingCalendar(desk, team) {
  const source = desk ? await loadCalendarSource(desk.business_calendar_id) : null;
  const teamHours = team ? parseJson(team.working_hours) : null;
  if (!teamHours) return source ? source.calendar : null;
  return normalizeCalendar({
    id: team.id,
    key: `team:${team.key || team.id}`,
    timezone: source ? source.row.timezone : 'UTC',
    working_days: teamHours,
    holidays: source ? source.holidays : [],
  });
}

/** The calendar-local date, because a leave day boundary in the wrong zone is an off-by-one absence. */
function dateKeyInZone(timezone, at) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(at);
    return parts;
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

// ── candidates and facts ──────────────────────────────────────────────────

/**
 * Everyone who could conceivably take a ticket on this desk: the active members
 * of its active teams, plus the desk's default assignee (who may hold no team).
 *
 * `m.*` rather than a column list, on purpose — per-member skills, languages,
 * capabilities and an explicit max_open_tickets are all columns the schema does
 * not have yet, and selecting the whole row means they start working the day the
 * migration adds them without a change here.
 */
async function loadCandidates(desk, teamId) {
  if (!desk) return [];
  const qb = getDb()(`${TEAM_MEMBERS} as m`)
    .join(`${TEAMS} as t`, 't.id', 'm.team_id')
    .join(`${USERS} as u`, 'u.id', 'm.user_id')
    .where('t.desk_id', desk.id)
    .where('t.is_active', true)
    .where('m.is_active', true)
    .select(
      'm.*',
      't.id as team_id',
      't.key as team_key',
      't.name as team_name',
      't.manager_id as team_manager_id',
      't.working_hours as team_working_hours',
      't.skills as team_skills',
      'u.username as username',
      'u.display_name as display_name',
      'u.email as email',
      'u.blocked as blocked'
    );
  if (toId(teamId)) qb.where('t.id', toId(teamId));
  const rows = await qb.orderBy('t.id', 'asc').orderBy('m.id', 'asc');

  const byUser = new Map();
  for (const row of rows) {
    const userId = toId(row.user_id);
    if (!userId) continue;
    // A user on two teams of the same desk is one candidate. When a team was
    // resolved the query already narrowed to it; otherwise the lowest team id
    // wins, which the ordering above makes deterministic rather than whatever
    // the optimiser returned this time.
    if (byUser.has(userId)) continue;
    byUser.set(userId, {
      userId,
      label: row.display_name || row.username || row.email || `user:${userId}`,
      blocked: toBoolean(row.blocked),
      teamId: toId(row.team_id),
      teamKey: row.team_key,
      teamManagerId: toId(row.team_manager_id),
      roleInTeam: row.role_in_team,
      capacityWeight: Number(row.capacity_weight === null || row.capacity_weight === undefined ? 100 : row.capacity_weight),
      skills: toStringSet(parseJson(row.skills), parseJson(row.team_skills)),
      capabilities: toStringSet(parseJson(row.capabilities)),
      languages: toStringSet(parseJson(row.languages)),
      branchIds: (parseJson(row.branch_ids) || []).map(toId).filter(Boolean),
      maxOpenOverride: row.max_open_tickets === undefined ? null : toId(row.max_open_tickets),
      isDeskDefault: false,
    });
  }

  const fallbackId = toId(desk.default_assignee_id);
  if (fallbackId && !byUser.has(fallbackId)) {
    const user = await getDb()(USERS).where('id', fallbackId).first('id', 'username', 'display_name', 'email', 'blocked');
    if (user) {
      byUser.set(fallbackId, {
        userId: fallbackId,
        label: user.display_name || user.username || user.email || `user:${fallbackId}`,
        blocked: toBoolean(user.blocked),
        teamId: null,
        teamKey: null,
        teamManagerId: null,
        roleInTeam: 'member',
        capacityWeight: 100,
        skills: new Set(),
        capabilities: new Set(),
        languages: new Set(),
        branchIds: [],
        maxOpenOverride: null,
        isDeskDefault: true,
      });
    }
  }
  return [...byUser.values()];
}

/**
 * Open load per agent, ACROSS DESKS. Capacity is a property of the person, not
 * of one desk: an agent sitting on twenty open tickets elsewhere has no room
 * here either, and counting per desk is how a shared agent ends up with three
 * full caps.
 */
async function loadOpenLoad(userIds) {
  const load = new Map(userIds.map((id) => [id, { count: 0, weighted: 0 }]));
  if (!userIds.length) return load;
  const rows = await getDb()(`${ASSIGNEE_LNK} as l`)
    .join(`${TICKETS} as t`, 't.id', 'l.contact_ticket_id')
    .whereIn('l.user_id', userIds)
    .whereIn('t.status', LOAD_STATUSES)
    .whereNull('t.archived_at')
    .groupBy('l.user_id', 't.priority')
    .select('l.user_id as user_id', 't.priority as priority')
    .count('t.id as total');
  for (const row of rows) {
    const entry = load.get(toId(row.user_id));
    if (!entry) continue;
    const n = Number(row.total);
    entry.count += n;
    entry.weighted += n * (PRIORITY_WEIGHT[row.priority] || DEFAULT_PRIORITY_WEIGHT);
  }
  return load;
}

/**
 * The rotation cursor, DERIVED rather than stored: the highest ticket id each
 * agent has ever been assigned on this desk. Whoever's is lowest went longest
 * ago and is next; an agent who has never been assigned has none and goes first.
 * A stored cursor would drift on every reassignment, on every agent who joins or
 * leaves, and would be lost on restart — this cannot.
 */
async function loadRotation(userIds, deskId) {
  const rotation = new Map();
  if (!userIds.length) return rotation;
  const qb = getDb()(`${ASSIGNEE_LNK} as l`)
    .join(`${TICKETS} as t`, 't.id', 'l.contact_ticket_id')
    .whereIn('l.user_id', userIds)
    .groupBy('l.user_id')
    .select('l.user_id as user_id')
    .max('l.contact_ticket_id as last_ticket_id');
  if (toId(deskId)) qb.where('t.desk_id', toId(deskId));
  for (const row of await qb) rotation.set(toId(row.user_id), Number(row.last_ticket_id));
  return rotation;
}

/**
 * THE CHECK MOST OFTEN FORGOTTEN AND MOST VISIBLE WHEN MISSED (§14.4). Assigning
 * to someone on annual leave silently guarantees a breach, and HR already holds
 * the data — so this is a join, not a heuristic.
 *
 * Only APPROVED leave counts: a pending request is a request, not an absence.
 * The window is compared in the desk calendar's timezone, because a leave day is
 * a local day and comparing it against a UTC date is an off-by-one at both ends.
 */
async function loadOnLeave(userIds, dateKey) {
  const onLeave = new Set();
  if (!userIds.length) return onLeave;
  const rows = await getDb()(`${LEAVE_REQUESTS} as lr`)
    .join(`${LEAVE_EMPLOYEE_LNK} as le`, 'le.hr_leave_request_id', 'lr.id')
    .join(`${EMPLOYEE_USER_LNK} as eu`, 'eu.hr_employee_id', 'le.hr_employee_id')
    .whereIn('eu.user_id', userIds)
    .where('lr.status', 'Approved')
    .where('lr.start_date', '<=', dateKey)
    .where('lr.end_date', '>=', dateKey)
    .distinct()
    .pluck('eu.user_id');
  for (const id of rows) onLeave.add(toId(id));
  return onLeave;
}

/** The requester's identities, so "an agent cannot be assigned their own request" covers all three. */
async function loadIdentities(userIds) {
  const identities = new Map(userIds.map((id) => [id, { personId: null, employeeId: null }]));
  if (!userIds.length) return identities;
  const employees = await getDb()(EMPLOYEE_USER_LNK).whereIn('user_id', userIds).select('user_id', 'hr_employee_id');
  for (const row of employees) {
    const entry = identities.get(toId(row.user_id));
    if (entry) entry.employeeId = toId(row.hr_employee_id);
  }
  const people = await getDb()(PERSON_USER_LNK).whereIn('user_id', userIds).select('user_id', 'person_id');
  for (const row of people) {
    const entry = identities.get(toId(row.user_id));
    if (entry) entry.personId = toId(row.person_id);
  }
  return identities;
}

/**
 * Capabilities a ticket demands before anyone may hold it (§14.4, "e.g. a
 * remote-support grant"). Two declarations, both data:
 *   custom_fields.required_capabilities: ["remote_support"]
 *   tags: ["requires:remote_support"]
 * The tag form exists because tags are what agents and automation already reach
 * for, and a capability requirement that needs a form field would rarely be set.
 */
function requiredCapabilities(ticket) {
  const declared = ticket.custom_fields && ticket.custom_fields.required_capabilities;
  const fromTags = (ticket.tags || [])
    .map((tag) => /^requires:(.+)$/i.exec(String(tag)))
    .filter(Boolean)
    .map((m) => m[1]);
  return toStringSet(declared, fromTags);
}

function ticketLanguages(ticket) {
  const declared = ticket.custom_fields && (ticket.custom_fields.language || ticket.custom_fields.languages);
  const fromTags = (ticket.tags || [])
    .map((tag) => /^lang:(.+)$/i.exec(String(tag)))
    .filter(Boolean)
    .map((m) => m[1]);
  return toStringSet(declared, fromTags);
}

/**
 * What the ticket needs someone to be good at. Tags carry it in practice —
 * they are what agents and auto-tagging already produce — and an explicit
 * custom field is honoured for desks that model it properly.
 */
function ticketSkills(ticket) {
  return toStringSet(ticket.tags, ticket.custom_fields && ticket.custom_fields.skills);
}

function capOf(candidate) {
  if (candidate.maxOpenOverride) return candidate.maxOpenOverride;
  const weight = Number.isFinite(candidate.capacityWeight) ? candidate.capacityWeight : 100;
  return Math.max(0, Math.round((DEFAULT_MAX_OPEN * weight) / 100));
}

// ── eligibility (§14.4) ───────────────────────────────────────────────────

/**
 * ALL of these must hold. Synchronous and total: every check is evaluated, so
 * the report explains the whole decision rather than the first thing that went
 * wrong. `facts` is everything the checks need, loaded once for the whole pool.
 */
function checkEligibility(candidate, ticket, facts) {
  const checks = [];
  const add = (check, ok, detail) => { checks.push({ check, ok, detail: detail || null }); return ok; };

  add('active_user', !candidate.blocked, candidate.blocked ? 'user is blocked' : null);

  // Membership of a team on the desk (or being its default assignee) IS what
  // "holds a role on the desk" means in the delivered schema — the same
  // definition policy/entitlement.js derives deskIds from, deliberately, so the
  // routing pool and the authorization gate can never disagree.
  add('desk_role', Boolean(candidate.teamId) || candidate.isDeskDefault, candidate.isDeskDefault ? 'desk default assignee' : null);

  if (facts.teamId) {
    add('team_member', candidate.teamId === facts.teamId, candidate.teamId ? `member of team #${candidate.teamId}` : 'no team');
  } else {
    add('team_member', true, 'no team routing');
  }

  if (facts.calendar) {
    let working = false;
    try {
      working = isWorkingTime(facts.calendar, facts.at);
    } catch (err) {
      // A malformed calendar must not silently exclude the whole desk; it is a
      // configuration fault, reported here and passed.
      return { eligible: false, checks: [...checks, { check: 'working_hours', ok: false, detail: `calendar error: ${err.message}` }] };
    }
    add('working_hours', working, working ? null : 'outside the team calendar');
  } else {
    // No calendar resolved is not evidence that nobody is working.
    add('working_hours', true, 'no calendar configured');
  }

  const onLeave = facts.onLeave.has(candidate.userId);
  add('not_on_leave', !onLeave, onLeave ? 'approved leave covers today' : null);

  const load = facts.load.get(candidate.userId) || { count: 0, weighted: 0 };
  const cap = capOf(candidate);
  add('under_cap', load.count < cap, `${load.count}/${cap} open`);

  const identity = facts.identities.get(candidate.userId) || {};
  const isRequester = (ticket.user_id && ticket.user_id === candidate.userId)
    || (ticket.person_id && identity.personId && ticket.person_id === identity.personId)
    || (ticket.employee_id && identity.employeeId && ticket.employee_id === identity.employeeId);
  add('not_requester', !isRequester, isRequester ? 'is the requester' : null);

  const held = new Set([...candidate.capabilities, ...(facts.roleKeys.get(candidate.userId) || [])]);
  const missing = [...facts.requiredCapabilities].filter((c) => !held.has(c));
  add('has_capabilities', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : null);

  return { eligible: checks.every((c) => c.ok), checks };
}

async function loadRoleKeys(userIds) {
  const keys = new Map(userIds.map((id) => [id, new Set()]));
  if (!userIds.length) return keys;
  const rows = await getDb()('up_users_app_roles_lnk as l')
    .join('api_pro_app_roles as r', 'r.id', 'l.app_role_id')
    .whereIn('l.user_id', userIds)
    .select('l.user_id as user_id', 'r.key as key');
  for (const row of rows) {
    const set = keys.get(toId(row.user_id));
    if (set) set.add(String(row.key).trim().toLowerCase());
  }
  return keys;
}

async function gatherFacts(desk, team, ticket, candidates, at) {
  const userIds = candidates.map((c) => c.userId);
  const calendar = await resolveWorkingCalendar(desk, team);
  const dateKey = dateKeyInZone(calendar ? calendar.timezone : 'UTC', at);
  return {
    at,
    deskId: desk ? desk.id : null,
    teamId: team ? team.id : null,
    calendar,
    load: await loadOpenLoad(userIds),
    onLeave: await loadOnLeave(userIds, dateKey),
    identities: await loadIdentities(userIds),
    roleKeys: await loadRoleKeys(userIds),
    rotation: await loadRotation(userIds, desk ? desk.id : null),
    requiredCapabilities: requiredCapabilities(ticket),
    languages: ticketLanguages(ticket),
    skills: ticketSkills(ticket),
  };
}

// ── strategies (§14.3) ────────────────────────────────────────────────────

function shareOf(candidate) {
  const weight = Number.isFinite(candidate.capacityWeight) ? candidate.capacityWeight : 100;
  return weight > 0 ? weight / 100 : 0.01;
}

/**
 * Ties break on the lowest user id rather than on iteration order, so two runs
 * over the same state pick the same agent — a routing decision that changes when
 * nothing changed cannot be debugged.
 */
function leastBusy(pool, facts, weighted) {
  let best = null;
  for (const candidate of pool) {
    const load = facts.load.get(candidate.userId) || { count: 0, weighted: 0 };
    const score = (weighted ? load.weighted : load.count) / shareOf(candidate);
    if (!best || score < best.score || (score === best.score && candidate.userId < best.candidate.userId)) {
      best = { candidate, score };
    }
  }
  if (!best) return { agent: null, why: 'no eligible agent' };
  return {
    agent: best.candidate,
    why: `${weighted ? 'weighted load' : 'open tickets'} ${best.score.toFixed(2)} per full share`,
  };
}

function roundRobin(pool, facts) {
  let best = null;
  for (const candidate of pool) {
    const last = facts.rotation.has(candidate.userId) ? facts.rotation.get(candidate.userId) : -1;
    if (!best || last < best.last || (last === best.last && candidate.userId < best.candidate.userId)) {
      best = { candidate, last };
    }
  }
  if (!best) return { agent: null, why: 'no eligible agent' };
  return { agent: best.candidate, why: best.last < 0 ? 'never assigned on this desk' : `last assigned ticket #${best.last}` };
}

/**
 * Narrowing that refuses to empty the pool. Every composite step below uses it:
 * a filter that matches nobody is not evidence that nobody is suitable, it is
 * evidence that the desk has not configured that dimension — and narrowing to
 * zero would turn a routable ticket into a routing failure.
 */
function narrow(pool, predicate, label, trace) {
  const kept = pool.filter(predicate);
  if (!kept.length) {
    trace.push({ step: label, applied: false, detail: 'no candidate matched — not narrowed' });
    return pool;
  }
  if (kept.length === pool.length) {
    trace.push({ step: label, applied: false, detail: 'every candidate matched' });
    return pool;
  }
  trace.push({ step: label, applied: true, detail: `${kept.length}/${pool.length} matched` });
  return kept;
}

function bySkill(pool, facts, trace) {
  if (!facts.skills.size) {
    trace.push({ step: 'skill', applied: false, detail: 'ticket declares no skills' });
    return pool;
  }
  return narrow(pool, (c) => intersects(facts.skills, c.skills), 'skill', trace);
}

function byBranch(pool, ticket, trace) {
  if (!ticket.branch_id) {
    trace.push({ step: 'branch', applied: false, detail: 'ticket has no branch' });
    return pool;
  }
  return narrow(pool, (c) => c.branchIds.length === 0 || c.branchIds.includes(ticket.branch_id), 'branch', trace);
}

function byLanguage(pool, facts, trace) {
  if (!facts.languages.size) {
    trace.push({ step: 'language', applied: false, detail: 'ticket declares no language' });
    return pool;
  }
  return narrow(pool, (c) => intersects(facts.languages, c.languages), 'language', trace);
}

/**
 * The requester's previous assignee, for relationship continuity — subject to
 * the same eligibility filter and the same cap as everyone else, which is what
 * stops "their agent" becoming "their agent's backlog".
 */
async function stickyAgentId(ticket) {
  const qb = getDb()(`${TICKETS} as t`)
    .join(`${ASSIGNEE_LNK} as l`, 'l.contact_ticket_id', 't.id')
    .whereNot('t.id', ticket.id)
    .orderBy('t.id', 'desc')
    .limit(1)
    .select('l.user_id as user_id');
  if (ticket.person_id) qb.join(`${PERSON_LNK} as p`, 'p.contact_ticket_id', 't.id').where('p.person_id', ticket.person_id);
  else if (ticket.user_id) qb.join(`${USER_LNK} as u`, 'u.contact_ticket_id', 't.id').where('u.user_id', ticket.user_id);
  else if (ticket.employee_id) qb.join(`${EMPLOYEE_LNK} as e`, 'e.contact_ticket_id', 't.id').where('e.hr_employee_id', ticket.employee_id);
  else return null;
  const row = await qb.first();
  return row ? toId(row.user_id) : null;
}

async function applyStrategy(strategy, pool, ticket, facts) {
  const trace = [];
  if (!pool.length) return { agent: null, strategy, why: 'no eligible agent', trace };

  switch (strategy) {
    case 'manual':
      // Not a failure: the desk chose to queue rather than push.
      return { agent: null, strategy, why: 'desk routes manually — queued for self-claim', trace, manual: true };

    case 'round_robin':
      return { ...roundRobin(pool, facts), strategy, trace };

    case 'least_busy':
      return { ...leastBusy(pool, facts, false), strategy, trace };

    case 'least_busy_weighted':
      return { ...leastBusy(pool, facts, true), strategy, trace };

    case 'skill_based':
      return { ...leastBusy(bySkill(pool, facts, trace), facts, false), strategy, trace };

    case 'branch_based':
      return { ...leastBusy(byBranch(pool, ticket, trace), facts, false), strategy, trace };

    case 'language_based':
      return { ...leastBusy(byLanguage(pool, facts, trace), facts, false), strategy, trace };

    case 'sticky': {
      const previous = await stickyAgentId(ticket);
      const hit = previous ? pool.find((c) => c.userId === previous) : null;
      if (hit) return { agent: hit, strategy, why: 'handled this requester last time', trace };
      trace.push({ step: 'sticky', applied: false, detail: previous ? 'previous agent is not eligible' : 'no previous agent' });
      return { ...leastBusy(pool, facts, false), strategy, trace };
    }

    case AI_STRATEGY: {
      // The seam. §22 owns the suggestion; whatever it returns must still be run
      // through the pool above, never around it.
      trace.push({ step: 'ai', applied: false, detail: 'ai_assisted is not implemented — falling back to load_balanced' });
      const fallback = await applyStrategy('load_balanced', pool, ticket, facts);
      return { ...fallback, strategy, unavailable: AI_STRATEGY, trace: [...trace, ...fallback.trace] };
    }

    case 'load_balanced':
    default: {
      let narrowed = bySkill(pool, facts, trace);
      narrowed = byBranch(narrowed, ticket, trace);
      narrowed = byLanguage(narrowed, facts, trace);
      return { ...leastBusy(narrowed, facts, false), strategy: 'load_balanced', trace };
    }
  }
}

// ── team resolution (§14.2 step 2) ────────────────────────────────────────

async function loadTeam(teamId) {
  const id = toId(teamId);
  if (!id) return null;
  const row = await getDb()(TEAMS).where('id', id).where('is_active', true).first('*');
  return row ? { ...row, id: Number(row.id), skills: parseJson(row.skills) } : null;
}

/**
 * Rule target > desk default > skill match > branch match. A team that turns out
 * to be on another desk is ignored rather than honoured: the desk decision came
 * first and a rule pointing across it is a misconfiguration, not an instruction.
 */
async function resolveTeam(desk, ticket, rule, wantedSkills) {
  if (rule && toId(rule.target_team_id)) {
    const team = await loadTeam(rule.target_team_id);
    if (team && team.desk_id === desk.id) return { team, matchedBy: 'rule' };
  }
  if (desk && toId(desk.default_team_id)) {
    const team = await loadTeam(desk.default_team_id);
    if (team && team.desk_id === desk.id) return { team, matchedBy: 'desk_default' };
  }

  const teams = (await getDb()(TEAMS).where('desk_id', desk.id).where('is_active', true).orderBy('sequence', 'asc').select('*'))
    .map((row) => ({ ...row, id: Number(row.id), skills: parseJson(row.skills) }));

  const wanted = wantedSkills || ticketSkills(ticket);
  if (wanted.size) {
    const hit = teams.find((t) => intersects(wanted, toStringSet(t.skills)));
    if (hit) return { team: hit, matchedBy: 'skill' };
  }
  if (ticket.branch_id) {
    const hit = teams.find((t) => (parseJson(t.branch_ids) || []).map(toId).includes(ticket.branch_id));
    if (hit) return { team: hit, matchedBy: 'branch' };
  }
  return { team: null, matchedBy: 'none' };
}

// ── assignment writes ─────────────────────────────────────────────────────

function warn(message) {
  const log = global.strapi && global.strapi.log;
  if (log && typeof log.warn === 'function') log.warn(message);
  else console.warn(message);
}

/**
 * The label ticket.service.assign() puts in the summary, so both services write
 * the same sentence. Looked up only when the caller has not already loaded the
 * user — every path here except a bare unassign already holds it.
 */
async function assigneeLabel(userId, known) {
  if (known) return known;
  if (!userId) return null;
  const row = await getDb()(USERS).where('id', userId).first('username', 'display_name', 'email');
  return (row && (row.display_name || row.username || row.email)) || `user:${userId}`;
}

/**
 * RULE-12 / spec 30 §30.4: every mutation is audited, whichever service made it.
 * The shape mirrors ticket.service.assign() exactly — same kinds, same summaries,
 * same from/to — because /tickets/:id/activity renders ONE timeline, and a row
 * that reads differently depending on which code path moved the ticket is harder
 * to trust than no row at all.
 *
 * Best-effort, like every other appendActivity call in the module: the
 * repository already swallows and warns on its own insert, and the label lookup
 * is wrapped here for the same reason. An assignment that has been written must
 * not be rolled back because its audit row could not be — but it is never silent.
 */
async function auditAssignment(ticket, userId, options = {}) {
  const to = toId(userId);
  const from = options.from === undefined ? (ticket.assigned_to_id || null) : (options.from || null);
  try {
    const label = await assigneeLabel(to, options.label);
    await ticketRepo.appendActivity({
      documentId: ticket.documentId,
      kind: to ? 'assigned' : 'unassigned',
      summary: to ? `Assigned to ${label}` : 'Returned to the desk queue',
      from,
      to,
      actor: options.actor || null,
      reason: options.reason || null,
      data: options.data,
    });
  } catch (err) {
    warn(`[helpdesk] assignment audit failed for ${ticket.documentId}: ${err.message}`);
  }
}

/**
 * Written against the link table rather than through documents() / ticket.repo:
 * the compare-and-set below needs a guarded UPDATE the shim cannot express, and
 * a single file writing one column through two different paths is how the two
 * eventually disagree. The rows produced are identical — contact-ticket has no
 * lifecycle middleware, so nothing is bypassed by taking the direct route.
 *
 * Takes the ticket ROW rather than its id because the audit row is written here,
 * next to the write it describes: it needs the documentId and the outgoing
 * assignee, and every caller already holds the ticket. Keeping the two together
 * is what stops a fourth caller appearing later with no timeline entry.
 */
async function writeAssignment(ticket, userId, audit = {}) {
  await getDb()(ASSIGNEE_LNK).where('contact_ticket_id', ticket.id).del();
  if (userId) await getDb()(ASSIGNEE_LNK).insert({ contact_ticket_id: ticket.id, user_id: userId });
  await getDb()(TICKETS).where('id', ticket.id).update({ updated_at: new Date() });
  await auditAssignment(ticket, userId, audit);
}

/**
 * The desk/team move. Audited as a `note` carrying `data.changes`, the shape
 * TicketService.update() uses for a reclassification, so a desk change reads the
 * same on the timeline whichever service made it.
 *
 * Audited only when something actually moved: re-routing a ticket to the desk
 * and team it already had touches nothing but `updated_at`, and a note on every
 * route() call would bury the ones that mean something.
 */
async function writeRouting(ticket, deskId, teamId, audit = {}) {
  const patch = { updated_at: new Date() };
  if (deskId) patch.desk_id = deskId;
  patch.team_id = teamId || null;
  await getDb()(TICKETS).where('id', ticket.id).update(patch);

  const changes = {};
  const nextDesk = patch.desk_id === undefined ? ticket.desk_id : toId(patch.desk_id);
  const nextTeam = toId(patch.team_id);
  if (nextDesk !== ticket.desk_id) changes.desk_id = { from: ticket.desk_id, to: nextDesk };
  if (nextTeam !== ticket.team_id) changes.team_id = { from: ticket.team_id, to: nextTeam };
  if (!Object.keys(changes).length) return;

  try {
    await ticketRepo.appendActivity({
      documentId: ticket.documentId,
      kind: 'note',
      summary: changes.desk_id
        ? `Routed to desk ${audit.deskKey || changes.desk_id.to}`
        : `Routed to team ${nextTeam === null ? '(none)' : `#${nextTeam}`}`,
      ...(changes.desk_id ? { from: changes.desk_id.from, to: changes.desk_id.to } : {}),
      actor: audit.actor || null,
      reason: audit.reason || null,
      data: { changes, strategy: audit.strategy || null, rule_id: audit.ruleId || null },
    });
  } catch (err) {
    warn(`[helpdesk] routing audit failed for ${ticket.documentId}: ${err.message}`);
  }
}

/**
 * The compare-and-set. See the file docblock for why the guard sits on the
 * ticket row and not on the link table.
 *
 * The zero-affected branch is disambiguated rather than assumed: MySQL reports
 * only CHANGED rows, so an UPDATE whose `updated_at` already equals `now` to the
 * millisecond — routing immediately after create, inside one transaction —
 * reports zero while having matched, locked and passed the guard. Re-reading the
 * link table at that point is safe precisely because the row lock is held, so
 * this is a disambiguation under a lock, not the read-then-write the CAS exists
 * to avoid.
 */
async function compareAndSetAssignee(ticketId, userId) {
  const affected = await getDb()(TICKETS)
    .where('id', ticketId)
    .whereNotExists(function noAssignee() {
      this.select(getDb().raw('1')).from(ASSIGNEE_LNK).where('contact_ticket_id', ticketId);
    })
    .update({ updated_at: new Date() });

  if (affected === 0) {
    const existing = await getDb()(ASSIGNEE_LNK).where('contact_ticket_id', ticketId).first('user_id');
    if (existing) return { claimed: false, heldBy: toId(existing.user_id) };
  }
  await getDb()(ASSIGNEE_LNK).insert({ contact_ticket_id: ticketId, user_id: userId });
  return { claimed: true, heldBy: userId };
}

// ── notification targets ──────────────────────────────────────────────────

/**
 * Who hears about a routing failure. The team managers of the desk, falling back
 * to its default assignee — resolved HERE rather than in the notification
 * subscriber so the event carries the answer and the two never disagree about
 * who owns a desk.
 */
async function deskManagerIds(desk) {
  if (!desk) return [];
  const ids = await getDb()(TEAMS)
    .where('desk_id', desk.id)
    .where('is_active', true)
    .whereNotNull('manager_id')
    .distinct()
    .pluck('manager_id');
  const managers = [...new Set(ids.map(toId).filter(Boolean))];
  if (managers.length) return managers;
  const fallback = toId(desk.default_assignee_id);
  return fallback ? [fallback] : [];
}

// ── the pipeline ──────────────────────────────────────────────────────────

/**
 * The desk an entitlement decision must be made against. A ticket that has none
 * yet — the legacy public submit route creates one, and so does anything
 * predating the backfill — is resolved first, because `can()` scopes a manager
 * to their desks and a null desk denies every band except admin. Assigning that
 * a 403 would mean the tickets most in need of triage are the ones nobody may
 * triage.
 */
async function deskForTicket(actor, ticket) {
  if (ticket.desk_id) {
    const desk = await deskService.loadDeskById(ticket.desk_id);
    if (desk) return desk;
  }
  try {
    return (await deskService.resolveDeskFor(actor, { ...ticket })).desk;
  } catch {
    return null;
  }
}

/**
 * ROUTING AN UNASSIGNED TICKET IS NOT AN ASSIGNMENT PRIVILEGE. Taking a ticket
 * off an agent is a manager act and needs `ticket.assign`; letting the queue
 * decide who picks up something nobody holds is intake, and anyone who may see
 * the ticket may trigger it. The distinction is what lets TicketService.create
 * route with the REQUESTER's actor — the alternative would be either a 403 on
 * every self-service ticket or `ticket.assign` granted to the requester band,
 * and the second is how a customer ends up able to reassign an agent's queue.
 */
function assertMayRoute(actor, ticket, desk) {
  if (hasBand(actor, 'system')) return;
  if (ticket.assigned_to_id) {
    assertCan(actor, 'ticket.assign', { ticket, desk });
    return;
  }
  assertCan(actor, 'ticket.read', { ticket, desk });
}

function resolveStrategy(rule, desk, team) {
  // First defined wins. `routing_strategy` is not a column on either table yet,
  // so both read undefined and the tenant default applies — written as a lookup
  // so that adding the column is the whole change.
  if (rule && rule.strategy) return { strategy: rule.strategy, from: 'rule' };
  if (team && team.routing_strategy) return { strategy: team.routing_strategy, from: 'team' };
  if (desk && desk.routing_strategy) return { strategy: desk.routing_strategy, from: 'desk' };
  return { strategy: DEFAULT_STRATEGY, from: 'tenant_default' };
}

/**
 * Everything between "which desk" and "which agent", with no writes and no
 * throws that the caller has to think about. route() and previewRoute() share it
 * so the dry run cannot drift from the real thing.
 */
async function selectAssignee(ticket, options = {}) {
  const at = options.at instanceof Date ? options.at : new Date();

  let deskResolution;
  if (options.desk) deskResolution = { desk: options.desk, matchedBy: ticket.desk_id ? 'ticket' : 'resolved' };
  else if (ticket.desk_id) deskResolution = { desk: await deskService.loadDeskById(ticket.desk_id), matchedBy: 'ticket' };
  else deskResolution = await deskService.resolveDeskFor(options.actor, { ...ticket, at });
  const desk = deskResolution.desk;
  if (!desk) throw new ValidationError(`Ticket ${ticket.documentId} has no resolvable desk`);

  const context = buildConditionContext(ticket, { at, deskKey: desk.key });
  const rules = await listRuleRows({ deskId: desk.id });
  const { matched: rule, evaluated: ruleTrace } = matchRules(rules, context);

  const teamResolution = await resolveTeam(desk, ticket, rule, ticketSkills(ticket));
  const team = teamResolution.team;
  const { strategy, from: strategyFrom } = resolveStrategy(rule, desk, team);

  const candidates = await loadCandidates(desk, team ? team.id : null);
  const facts = await gatherFacts(desk, team, ticket, candidates, at);

  const eligibility = candidates.map((candidate) => ({
    userId: candidate.userId,
    label: candidate.label,
    teamId: candidate.teamId,
    ...checkEligibility(candidate, ticket, facts),
  }));
  const eligibleIds = new Set(eligibility.filter((e) => e.eligible).map((e) => e.userId));
  const pool = candidates.filter((c) => eligibleIds.has(c.userId));

  // An explicit agent on the matched rule is still subject to eligibility — a
  // rule is configuration, and configuration does not get to assign to someone
  // on leave (§14.4, "a strategy proposes, eligibility disposes").
  const pinned = rule && toId(rule.target_agent_id)
    ? pool.find((c) => c.userId === toId(rule.target_agent_id))
    : null;

  const outcome = pinned
    ? { agent: pinned, strategy: 'rule_target', why: `rule "${rule.name || rule.id}" names this agent`, trace: [] }
    : await applyStrategy(strategy, pool, ticket, facts);

  const overCapacity = candidates.length > 0 && pool.length === 0
    && eligibility.every((e) => e.checks.filter((c) => !c.ok).every((c) => c.check === 'under_cap'));

  return {
    desk,
    deskMatchedBy: deskResolution.matchedBy,
    team,
    teamMatchedBy: teamResolution.matchedBy,
    rule: rule ? { id: rule.id, name: rule.name || rule.key || `#${rule.id}`, strategy: rule.strategy } : null,
    ruleTrace,
    strategy: (outcome && outcome.strategy) || strategy,
    strategyFrom,
    agent: (outcome && outcome.agent) || null,
    why: (outcome && outcome.why) || 'no eligible agent',
    strategyTrace: (outcome && outcome.trace) || [],
    manual: Boolean(outcome && outcome.manual),
    candidates: eligibility,
    overCapacity,
    at,
  };
}

/**
 * Run the pipeline and persist the result. Returns the outcome; never throws for
 * a routing reason — see the docblock. Callers inside a ticket transaction can
 * therefore treat this as advisory, which is exactly what it is.
 */
async function route(actor, ticketRef, options = {}) {
  const ticket = await requireTicket(ticketRef);
  const desk = options.desk || await deskForTicket(actor, ticket);
  assertMayRoute(actor, ticket, desk);

  let selection = null;
  let failure = null;
  try {
    selection = await selectAssignee(ticket, { ...options, actor, desk });
  } catch (err) {
    failure = err;
  }

  // One transaction over the writes AND the events: the outbox row has to commit
  // with the assignment it describes, or a crash between them announces an
  // assignment that did not happen. withTransaction joins the caller's ambient
  // transaction when there is one, so routing from inside TicketService.create
  // stays a single unit.
  return withTransaction(() => persistRouting(actor, ticket, desk, selection, failure));
}

/**
 * The write half, separated so the whole of it fits in one transaction.
 *
 * A SELECTION failure has already been caught by the caller and arrives here as
 * `failure`, to be recorded as an unassigned outcome. A WRITE failure below is
 * NOT caught, deliberately: a statement that fails inside a transaction may have
 * left MySQL with the transaction already rolled back (a deadlock does exactly
 * that), so carrying on to emit would announce an assignment that no longer
 * exists. Routing never failing a ticket is about routing decisions; a database
 * that cannot write is a different kind of problem and must surface as one.
 */
async function persistRouting(actor, ticket, desk, selection, failure) {
  if (selection) {
    await writeRouting(ticket, selection.desk.id, selection.team ? selection.team.id : null, {
      actor,
      deskKey: selection.desk.key,
      strategy: selection.strategy,
      ruleId: selection.rule ? selection.rule.id : null,
    });
    if (selection.agent) {
      await writeAssignment(ticket, selection.agent.userId, {
        actor,
        label: selection.agent.label,
        // `why` IS the reason this agent was chosen — the same sentence
        // /routing/preview shows — so the timeline explains an automatic
        // assignment rather than merely recording one.
        reason: selection.why || null,
        data: {
          automatic: true,
          strategy: selection.strategy,
          rule_id: selection.rule ? selection.rule.id : null,
        },
      });
    }
  }

  const base = {
    ticketId: ticket.id,
    deskId: selection ? selection.desk.id : ticket.desk_id,
    teamId: selection && selection.team ? selection.team.id : null,
    strategy: selection ? selection.strategy : null,
    ruleId: selection && selection.rule ? selection.rule.id : null,
  };

  await emit({
    eventName: 'helpdesk.ticket.routed',
    entityUid: TICKET_UID,
    documentId: ticket.documentId,
    actor: eventActor(actor),
    payload: { ...base, assignedTo: selection && selection.agent ? selection.agent.userId : null, why: selection ? selection.why : null },
  });

  if (selection && selection.agent) {
    await emit({
      eventName: 'helpdesk.ticket.assigned',
      entityUid: TICKET_UID,
      documentId: ticket.documentId,
      actor: eventActor(actor),
      payload: { ...base, assignedTo: selection.agent.userId, previousAssignee: ticket.assigned_to_id, automatic: true },
    });
  } else if (!selection || !selection.manual) {
    const managers = await deskManagerIds(selection ? selection.desk : desk);
    await emit({
      eventName: 'helpdesk.ticket.routing_failed',
      entityUid: TICKET_UID,
      documentId: ticket.documentId,
      actor: eventActor(actor),
      payload: {
        ...base,
        reason: failure ? 'routing_error' : 'no_eligible_agent',
        error: failure ? failure.message : null,
        candidateCount: selection ? selection.candidates.length : 0,
        notify: managers,
      },
    });
  }

  if (selection && selection.overCapacity) {
    await emit({
      eventName: 'helpdesk.agent.over_capacity',
      actor: eventActor(actor),
      payload: {
        deskId: selection.desk.id,
        teamId: selection.team ? selection.team.id : null,
        agents: selection.candidates.map((c) => ({ userId: c.userId, label: c.label })),
      },
    });
  }

  const assigned = selection && selection.agent ? selection.agent.userId : null;
  const why = selection ? selection.why : (failure ? failure.message : 'routing failed');
  return {
    assigned,
    deskId: base.deskId,
    teamId: base.teamId,
    strategy: base.strategy,
    why,
    error: failure ? failure.message : null,
    // The snake_case aliases are TicketService's declared seam contract
    // (`{ assignee_id, team_id, reason }`). Both names describe the same
    // decision; carrying both means neither service has to edit the other.
    assignee_id: assigned,
    team_id: base.teamId,
    reason: why,
  };
}

/**
 * The dry run (§14.8). Returns the matched rule, the strategy and every
 * candidate's eligibility outcome — "what makes routing debuggable rather than
 * magical". Writes nothing, and reports a selection failure as data rather than
 * as an error, for the same reason route() does.
 */
async function previewRoute(actor, ticketRef, options = {}) {
  if (!deskService.canReadConfig(actor) && !hasBand(actor, 'system')) {
    throw new ForbiddenError('Not permitted: helpdesk.routing.preview');
  }
  const ticket = typeof ticketRef === 'object' && !ticketRef.id && !ticketRef.documentId
    ? mapTicket({ ...ticketRef, id: 0, document_id: 'preview' })
    : await requireTicket(ticketRef);

  try {
    const selection = await selectAssignee(ticket, { ...options, actor });
    return {
      ticketId: ticket.id || null,
      desk: { id: selection.desk.id, key: selection.desk.key, matchedBy: selection.deskMatchedBy },
      team: selection.team
        ? { id: selection.team.id, key: selection.team.key, matchedBy: selection.teamMatchedBy }
        : { id: null, matchedBy: selection.teamMatchedBy },
      rule: selection.rule,
      rulesEvaluated: selection.ruleTrace,
      strategy: selection.strategy,
      strategyFrom: selection.strategyFrom,
      strategyTrace: selection.strategyTrace,
      wouldAssign: selection.agent ? { userId: selection.agent.userId, label: selection.agent.label } : null,
      why: selection.why,
      candidates: selection.candidates,
      overCapacity: selection.overCapacity,
      evaluatedAt: selection.at,
    };
  } catch (err) {
    return { ticketId: ticket.id || null, wouldAssign: null, why: err.message, error: err.name, candidates: [] };
  }
}

/**
 * Eligibility snapshot with reasons for a whole desk or team (§14.8
 * /agents/availability). The same checks route() runs, against a synthetic
 * ticket, so "why is nobody available" and "why did nobody get this ticket" are
 * answered by the same code.
 */
async function availability(actor, options = {}) {
  if (!deskService.canReadConfig(actor) && !hasBand(actor, 'system')) {
    throw new ForbiddenError('Not permitted: helpdesk.routing.preview');
  }
  const desk = await deskService.loadDesk(options.deskId || options.deskKey);
  if (!desk) throw new NotFoundError(`No such desk: ${options.deskId || options.deskKey}`);
  const team = options.teamId ? await loadTeam(options.teamId) : null;
  const at = options.at instanceof Date ? options.at : new Date();

  const probe = mapTicket({ id: 0, document_id: 'availability', desk_id: desk.id, tags: '[]', custom_fields: '{}' });
  const candidates = await loadCandidates(desk, team ? team.id : null);
  const facts = await gatherFacts(desk, team, probe, candidates, at);

  return {
    deskId: desk.id,
    teamId: team ? team.id : null,
    at,
    agents: candidates.map((candidate) => {
      const load = facts.load.get(candidate.userId) || { count: 0, weighted: 0 };
      return {
        userId: candidate.userId,
        label: candidate.label,
        teamId: candidate.teamId,
        openTickets: load.count,
        cap: capOf(candidate),
        capacityWeight: candidate.capacityWeight,
        ...checkEligibility(candidate, probe, facts),
      };
    }),
  };
}

// ── manual assignment ─────────────────────────────────────────────────────

/**
 * A manager assigning by hand. Two checks are STRUCTURAL and refuse: the target
 * must be a real, unblocked user, and may not be the requester (§14.4 — an agent
 * cannot be assigned their own request; that is a rule, not a preference).
 * Leave, cap and working hours are ADVISORY here and come back in `warnings`: a
 * manager who assigns to someone on leave is making a decision, not a mistake,
 * and the UI can say so. Automatic routing never gets that latitude.
 */
async function assign(actor, ticketRef, userId, options = {}) {
  const ticket = await requireTicket(ticketRef);
  const desk = await deskForTicket(actor, ticket);
  assertCan(actor, 'ticket.assign', { ticket, desk });

  const target = toId(userId);
  if (!target) throw new ValidationError('assign requires a user id');
  const user = await getDb()(USERS).where('id', target).first('id', 'username', 'display_name', 'email', 'blocked');
  if (!user) throw new NotFoundError(`No such user: ${userId}`);
  if (toBoolean(user.blocked)) throw new ValidationError('That user is blocked');

  const identities = await loadIdentities([target]);
  const identity = identities.get(target) || {};
  const isRequester = (ticket.user_id && ticket.user_id === target)
    || (ticket.person_id && identity.personId && ticket.person_id === identity.personId)
    || (ticket.employee_id && identity.employeeId && ticket.employee_id === identity.employeeId);
  if (isRequester) throw new ValidationError('An agent cannot be assigned their own request');

  const warnings = [];
  if (desk) {
    const candidates = await loadCandidates(desk, null);
    const candidate = candidates.find((c) => c.userId === target);
    if (!candidate) warnings.push({ check: 'desk_role', detail: 'not a member of any team on this desk' });
    else {
      const facts = await gatherFacts(desk, candidate.teamId ? await loadTeam(candidate.teamId) : null, ticket, candidates, new Date());
      for (const check of checkEligibility(candidate, ticket, facts).checks) {
        if (!check.ok && check.check !== 'team_member') warnings.push(check);
      }
    }
  }

  const previous = ticket.assigned_to_id;
  await withTransaction(async () => {
    await writeAssignment(ticket, target, {
      actor,
      from: previous,
      label: user.display_name || user.username || user.email || null,
      reason: options.reason || null,
      data: { automatic: false, warnings },
    });
    await emit({
      eventName: 'helpdesk.ticket.assigned',
      entityUid: TICKET_UID,
      documentId: ticket.documentId,
      actor: eventActor(actor),
      payload: {
        ticketId: ticket.id,
        deskId: desk ? desk.id : ticket.desk_id,
        assignedTo: target,
        previousAssignee: previous,
        automatic: false,
        reason: options.reason || null,
        warnings,
      },
    });
  });

  return { assigned: target, previousAssignee: previous, warnings };
}

async function unassign(actor, ticketRef, options = {}) {
  const ticket = await requireTicket(ticketRef);
  const desk = await deskForTicket(actor, ticket);
  assertCan(actor, 'ticket.assign', { ticket, desk });
  if (!ticket.assigned_to_id) return { unassigned: null };

  const previous = ticket.assigned_to_id;
  await withTransaction(async () => {
    await writeAssignment(ticket, null, { actor, from: previous, reason: options.reason || null });
    await emit({
      eventName: 'helpdesk.ticket.unassigned',
      entityUid: TICKET_UID,
      documentId: ticket.documentId,
      actor: eventActor(actor),
      payload: { ticketId: ticket.id, deskId: desk ? desk.id : ticket.desk_id, previousAssignee: previous, reason: options.reason || null },
    });
  });
  return { unassigned: previous };
}

/**
 * Self-claim from a queue (§14.6). The whole point is the race: two agents
 * clicking at the same instant produce one winner and one 409, never a silent
 * double-assignment. The transaction is not optional — the row lock the CAS
 * depends on lives for the length of it.
 *
 * The cap is enforced here, unlike the advisory treatment in assign(): a claim
 * is the agent choosing more work, and a cap that a click can walk past is not
 * a cap. A manager can still assign over it.
 */
async function claim(actor, ticketRef) {
  const ticket = await requireTicket(ticketRef);
  const desk = await deskForTicket(actor, ticket);
  assertCan(actor, 'ticket.assign.self', { ticket, desk });

  const userId = toId(actor && actor.id);
  if (!userId) throw new ForbiddenError('Only a signed-in agent can claim a ticket');
  // A courtesy fast path, NOT the gate: it saves a transaction on the common
  // "someone got there minutes ago" case. The compare-and-set below is what
  // actually decides, and it decides again under the row lock.
  if (ticket.assigned_to_id) {
    throw new ConflictError(`Ticket ${ticket.documentId} is already assigned`);
  }

  if (desk) {
    const candidates = await loadCandidates(desk, null);
    const candidate = candidates.find((c) => c.userId === userId);
    if (candidate) {
      const facts = await gatherFacts(desk, candidate.teamId ? await loadTeam(candidate.teamId) : null, ticket, candidates, new Date());
      const report = checkEligibility(candidate, ticket, facts);
      const blocking = report.checks.find((c) => !c.ok && ['under_cap', 'not_requester', 'active_user'].includes(c.check));
      if (blocking) throw new ValidationError(`Cannot claim: ${blocking.check} (${blocking.detail || 'failed'})`);
    }
  }

  return withTransaction(async () => {
    const result = await compareAndSetAssignee(ticket.id, userId);
    if (!result.claimed) {
      throw new ConflictError(`Ticket ${ticket.documentId} was claimed by someone else`);
    }
    // The CAS writes the link row itself (it has to, under the row lock), so the
    // audit that writeAssignment would have carried is written here instead.
    await auditAssignment(ticket, userId, {
      actor,
      from: null,
      label: actor && actor.label,
      data: { automatic: false, claimed: true },
    });
    await emit({
      eventName: 'helpdesk.ticket.assigned',
      entityUid: TICKET_UID,
      documentId: ticket.documentId,
      actor: eventActor(actor),
      payload: { ticketId: ticket.id, deskId: desk ? desk.id : ticket.desk_id, assignedTo: userId, previousAssignee: null, automatic: false, claimed: true },
    });
    return { assigned: userId, claimed: true };
  });
}

/**
 * Rebalancing (§14.5, §14.8 bulk/reassign). One bad ticket must not abort the
 * batch — a manager moving forty tickets off an agent who has gone on leave gets
 * a per-ticket outcome, not a rollback of the thirty-nine that worked.
 *
 * Entitlement is checked PER TICKET by the call it delegates to, not once here,
 * because desk scope is a property of the ticket: a manager of two desks handed
 * a mixed list must move the ones they own and be refused the rest.
 */
async function bulkReassign(actor, input = {}) {
  const refs = Array.isArray(input.tickets) ? input.tickets : [];
  if (!refs.length) throw new ValidationError('bulkReassign needs a list of tickets');
  const target = input.toUserId === null || input.toUserId === undefined ? null : toId(input.toUserId);

  const results = [];
  for (const ref of refs) {
    try {
      if (target) results.push({ ticket: ref, ...(await assign(actor, ref, target, input)) });
      else if (input.reroute) results.push({ ticket: ref, ...(await route(actor, ref, input)) });
      else results.push({ ticket: ref, ...(await unassign(actor, ref, input)) });
    } catch (err) {
      results.push({ ticket: ref, error: err.message, name: err.name });
    }
  }
  return { total: refs.length, failed: results.filter((r) => r.error).length, results };
}

/**
 * §14.5: an agent leaves the company and their open tickets return to the desk
 * queue, audited. Deliberately NOT automatic on leave — reassignment is a
 * judgement call and the spec says so; this is the manager's action, not a
 * trigger. Entitlement is checked per ticket by unassign(), for the same reason
 * bulkReassign does it there.
 */
async function unassignAllFor(actor, userId, options = {}) {
  const target = toId(userId);
  if (!target) throw new ValidationError('unassignAllFor requires a user id');
  const rows = await getDb()(`${ASSIGNEE_LNK} as l`)
    .join(`${TICKETS} as t`, 't.id', 'l.contact_ticket_id')
    .where('l.user_id', target)
    .whereIn('t.status', LOAD_STATUSES)
    .whereNull('t.archived_at')
    .pluck('t.id');

  const results = [];
  for (const id of rows) {
    try {
      results.push({ ticketId: id, ...(await unassign(actor, id, { reason: options.reason || 'agent_offboarded' })) });
    } catch (err) {
      results.push({ ticketId: id, error: err.message });
    }
  }
  return { total: rows.length, failed: results.filter((r) => r.error).length, results };
}

/**
 * §14.5 queue ageing: tickets that have sat unassigned past a threshold escalate
 * to the manager. Reported as `routing_failed` with reason `queue_ageing` rather
 * than as a new event name — it IS a routing failure, one that has now persisted,
 * and the notification rules that already route routing_failed to the desk
 * manager are the ones that should fire.
 */
async function escalateAgedUnassigned(actor, options = {}) {
  if (!deskService.canReadConfig(actor) && !hasBand(actor, 'system')) {
    throw new ForbiddenError('Not permitted: helpdesk.routing.preview');
  }
  const minutes = Number(options.olderThanMinutes || get('RUTBA_HELPDESK_UNASSIGNED_ESCALATE_MINUTES', '120')) || 120;
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);

  const qb = getDb()(`${TICKETS} as t`)
    .leftJoin(`${ASSIGNEE_LNK} as l`, 'l.contact_ticket_id', 't.id')
    .whereNull('l.user_id')
    .whereIn('t.status', LOAD_STATUSES)
    .whereNull('t.archived_at')
    .where('t.created_at', '<', cutoff)
    .select('t.id', 't.document_id', 't.desk_id', 't.priority', 't.created_at')
    .orderBy('t.created_at', 'asc')
    .limit(Number(options.limit) || 500);
  if (toId(options.deskId)) qb.where('t.desk_id', toId(options.deskId));

  const rows = await qb;
  const managersByDesk = new Map();
  for (const row of rows) {
    const deskId = toId(row.desk_id);
    if (!managersByDesk.has(deskId)) {
      managersByDesk.set(deskId, await deskManagerIds(await deskService.loadDeskById(deskId)));
    }
    await emit({
      eventName: 'helpdesk.ticket.routing_failed',
      entityUid: TICKET_UID,
      documentId: row.document_id,
      actor: eventActor(actor),
      payload: {
        ticketId: Number(row.id),
        deskId,
        reason: 'queue_ageing',
        ageMinutes: Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000),
        notify: managersByDesk.get(deskId),
      },
    });
  }
  return { escalated: rows.length, olderThanMinutes: minutes };
}

module.exports = {
  route,
  previewRoute,
  availability,
  assign,
  unassign,
  claim,
  bulkReassign,
  unassignAllFor,
  escalateAgedUnassigned,
  selectAssignee,
  applyStrategy,
  checkEligibility,
  matchDeskRule,
  matchRules,
  listRoutingRules,
  createRoutingRule,
  updateRoutingRule,
  buildConditionContext,
  loadTicket,
  STRATEGIES,
  LOAD_STATUSES,
  PRIORITY_WEIGHT,
  ROUTING_RULE_COLUMNS,
  AI_STRATEGY,
  ValidationError,
  NotFoundError,
  ConflictError,
};
