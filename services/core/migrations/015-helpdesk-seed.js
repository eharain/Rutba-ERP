'use strict';

/**
 * Reference data for the helpdesk: the default ticket workflow, one business
 * calendar, one SLA policy with a target per priority, the nine resolution
 * codes, the seven desks that point at all of it, and one empty team per desk.
 *
 * This ships as a migration, not as src/seed/data JSON, per the standing
 * convention — and because RULE-7 makes it load-bearing rather than
 * convenient: a desk without a workflow, an SLA policy and a business calendar
 * is invalid, so the module has no working configuration until these rows
 * exist. "Workflows ready to go" is this file.
 *
 * THE WORKFLOW IS THE POINT. Ticket statuses are canonical and fixed in code;
 * stages are configuration. The seeded set has three distinct waiting stages —
 * waiting_customer, waiting_supplier, waiting_internal — that all declare
 * maps_to_status 'waiting'. The workflow service validates the stage move, the
 * ticket service fires side effects on the canonical status, and that is the
 * whole reason a tenant can invent "Awaiting Parts From Supplier" without any
 * code learning the name: SLA pausing, reporting, notification routing and the
 * portal keep working because the stage maps to a status they already know.
 *
 * ELEVEN STAGES, NOT THE TEN LISTED IN SPEC §8.4. The spec's stage table omits
 * `merged` while its transition table (§8.5) lists "any non-terminal → merged"
 * as a transition. Seeding only ten would leave merge as the one status change
 * that cannot be a transition, forcing TicketService to write `status` directly
 * and breaking RULE-4 — the rule that makes every other guarantee in the module
 * checkable. The eleventh stage resolves the inconsistency in favour of the
 * rule. All ten named stages are present unchanged.
 *
 * WHAT THE SEEDED TRANSITIONS CANNOT EXPRESS. Spec §8.5 gives every transition
 * `requires` (e.g. a reason on cancel, a resolution note on resolve) and
 * `guards` (e.g. within the reopen window). The workflow.transition component
 * in pos-strapi has no such attributes, and documents() projects only declared
 * attributes — so seeding them would write values the reader can never see.
 * They arrive as undefined and every default applies, which is the workflow
 * service's documented no-op behaviour. Until those components gain the fields,
 * TicketService enforces requires/guards itself. Role gating DOES work, via the
 * legacy `approles` column the service still reads.
 *
 * ROLE TOKENS. `approles` carries api-pro app-role KEYS here
 * (helpdesk_staff / helpdesk_manager / helpdesk_admin), so TicketService must
 * pass role keys as actorRoles. Passing bare levels ('staff', 'manager') will
 * match nothing and deny the transition — visibly, which is the failure
 * direction to prefer.
 *
 * WHY THREE TRANSITIONS CARRY NO ROLES AT ALL (see REQUESTER below). A customer
 * holds no app role, so TicketService passes workflow.rolesAllow an EMPTY array
 * — which that function treats as "an actor who holds nothing" and denies,
 * unlike the null a machine actor passes. Every role-gated transition is
 * therefore closed to the requester, including close, reopen and cancel, which
 * the entitlement matrix grants the requester band with `own` scope and the
 * module exposes at /api/me/helpdesk/tickets/:id/{close,reopen}. Leaving those
 * transitions' approles empty is what makes rolesAllow short-circuit to
 * "unrestricted"; the entitlement matrix (ticket.close / ticket.reopen /
 * ticket.cancel, checked by TicketService AFTER the workflow gate) stays the
 * real authorization layer, so nothing is opened to a stranger.
 *
 * These had to be the EXISTING transitions relaxed rather than requester
 * copies added alongside them: workflow.findTransition takes the FIRST entry
 * matching a from/to pair, so a second `resolved → closed` would be visible to
 * legalTransitionsFrom and then denied by canTransition — the worst of both, an
 * action button that always fails. Every seeded from/to pair is still present.
 *
 * NO sla_hours ON ANY TRANSITION, deliberately. Setting it would enlist these
 * tickets in the generic workflowSlaSweep, which fires its own
 * workflow.sla_breach events — so every breach would be reported twice, once by
 * the shared sweep and once by the helpdesk SLA sweep that owns the two clocks
 * (spec §12.8). The helpdesk clocks live in helpdesk_sla_targets.
 *
 * Idempotent throughout: every row is looked up by its natural key first. A
 * re-run also repairs a desk whose RULE-7 pointers are still null, which is
 * what a run interrupted between this migration's steps leaves behind.
 */

const { documents } = require('../src/documents');
const { generateDocumentId } = require('../src/documents/write');

const TICKET_UID = 'api::contact-ticket.contact-ticket';
const WF_UID = 'api::workflow.workflow';

const DESKS = 'helpdesk_desks';
const TEAMS = 'helpdesk_teams';
const CALENDARS = 'helpdesk_business_calendars';
const POLICIES = 'helpdesk_sla_policies';
const TARGETS = 'helpdesk_sla_targets';
const RESOLUTION_CODES = 'helpdesk_resolution_codes';

const AGENT = 'helpdesk_staff,helpdesk_manager,helpdesk_admin';
const MANAGER = 'helpdesk_manager,helpdesk_admin';
// Empty, not a token: workflow.rolesAllow has no requester concept, and an
// unrestricted transition is the only shape it honours for an actor holding no
// app role. Named so the intent is not read as a forgotten value.
const REQUESTER = '';

const NON_TERMINAL_STAGES = [
  'new', 'triaged', 'working',
  'waiting_customer', 'waiting_supplier', 'waiting_internal',
  'pending_approval', 'resolved',
];

// Cancelling before anyone has started work is the requester's own decision;
// after that it is the desk's. Both stages map to canonical `open`.
const REQUESTER_CANCEL_STAGES = new Set(['new', 'triaged']);

const WORKFLOW = {
  name: 'Helpdesk Ticket — Default',
  entity_uid: TICKET_UID,
  description:
    'Default helpdesk lifecycle. Three separate waiting stages all map to the canonical ' +
    'waiting status, so a desk can distinguish who it is blocked on without any code change.',
  is_default: true,
  is_active: true,
  stages: [
    { key: 'new', name: 'New', local_name: 'نیا', maps_to_status: 'open', sequence: 10, color: 'secondary', is_initial: true },
    { key: 'triaged', name: 'Triaged', local_name: 'جانچا گیا', maps_to_status: 'open', sequence: 20, color: 'info' },
    { key: 'working', name: 'In Progress', local_name: 'زیرِ عمل', maps_to_status: 'in_progress', sequence: 30, color: 'primary' },
    { key: 'waiting_customer', name: 'Awaiting Customer', local_name: 'گاہک کا انتظار', maps_to_status: 'waiting', sequence: 40, color: 'warning' },
    { key: 'waiting_supplier', name: 'Awaiting Supplier', local_name: 'سپلائر کا انتظار', maps_to_status: 'waiting', sequence: 50, color: 'warning' },
    { key: 'waiting_internal', name: 'Awaiting Another Team', local_name: 'دوسری ٹیم کا انتظار', maps_to_status: 'waiting', sequence: 60, color: 'warning' },
    { key: 'pending_approval', name: 'Awaiting Approval', local_name: 'منظوری کا انتظار', maps_to_status: 'waiting', sequence: 70, color: 'warning' },
    { key: 'resolved', name: 'Resolved', local_name: 'حل شدہ', maps_to_status: 'resolved', sequence: 80, color: 'success' },
    { key: 'closed', name: 'Closed', local_name: 'بند', maps_to_status: 'closed', sequence: 90, color: 'success', is_terminal: true },
    { key: 'cancelled', name: 'Cancelled', local_name: 'منسوخ', maps_to_status: 'cancelled', sequence: 100, color: 'danger', is_terminal: true },
    { key: 'merged', name: 'Merged', local_name: 'ضم شدہ', maps_to_status: 'merged', sequence: 110, color: 'dark', is_terminal: true },
  ],
  transitions: [
    { from_key: 'new', to_key: 'triaged', label: 'Triage', approles: AGENT },
    { from_key: 'new', to_key: 'working', label: 'Start Work', approles: AGENT },
    { from_key: 'triaged', to_key: 'working', label: 'Start Work', approles: AGENT },

    { from_key: 'working', to_key: 'waiting_customer', label: 'Await Customer', approles: AGENT },
    { from_key: 'working', to_key: 'waiting_supplier', label: 'Await Supplier', approles: AGENT },
    { from_key: 'working', to_key: 'waiting_internal', label: 'Await Another Team', approles: AGENT },
    // Unblocking is also automatic when the requester replies (§8.7); a system
    // call passes no actorRoles and is trusted, so one entry serves both.
    { from_key: 'waiting_customer', to_key: 'working', label: 'Resume', approles: AGENT },
    { from_key: 'waiting_supplier', to_key: 'working', label: 'Resume', approles: AGENT },
    { from_key: 'waiting_internal', to_key: 'working', label: 'Resume', approles: AGENT },

    { from_key: 'working', to_key: 'pending_approval', label: 'Request Approval', approles: AGENT },
    { from_key: 'pending_approval', to_key: 'working', label: 'Approval Granted', approles: AGENT },

    { from_key: 'working', to_key: 'resolved', label: 'Resolve', approles: AGENT },
    // A ticket can be resolved straight out of a waiting stage — the answer
    // often arrives with the reply that unblocked it.
    { from_key: 'waiting_customer', to_key: 'resolved', label: 'Resolve', approles: AGENT },
    { from_key: 'waiting_supplier', to_key: 'resolved', label: 'Resolve', approles: AGENT },
    { from_key: 'waiting_internal', to_key: 'resolved', label: 'Resolve', approles: AGENT },

    // Accepting a resolution is the requester's move above all — and with
    // auto_close_after_days set, the one the portal offers most often.
    { from_key: 'resolved', to_key: 'closed', label: 'Close', approles: REQUESTER },
    // Reopen lands on triaged, not new: the ticket has already been through
    // triage and sending it back would reset the desk's own queue ordering.
    { from_key: 'resolved', to_key: 'triaged', label: 'Reopen', approles: REQUESTER },
    // Also ungated: the auto-close sweep closes a resolved ticket after 7 days
    // while the desk's reopen window runs for 14, so the requester who comes
    // back on day nine finds a CLOSED ticket. The window itself is enforced by
    // TicketService with no role exempt, and the entitlement matrix already
    // grants ticket.reopen to agents at desk scope — the MANAGER gate here only
    // contradicted it.
    { from_key: 'closed', to_key: 'triaged', label: 'Reopen', approles: REQUESTER },

    ...NON_TERMINAL_STAGES.map((key) => ({
      from_key: key,
      to_key: 'cancelled',
      label: key === 'pending_approval' ? 'Reject Approval' : 'Cancel',
      approles: REQUESTER_CANCEL_STAGES.has(key)
        ? REQUESTER
        : (key === 'pending_approval' ? AGENT : MANAGER),
    })),
    ...NON_TERMINAL_STAGES.map((key) => ({
      from_key: key, to_key: 'merged', label: 'Merge', approles: MANAGER,
    })),
  ],
};

const CALENDAR = {
  key: 'standard',
  name: 'Standard Business Hours',
  timezone: 'Asia/Karachi',
  working_days: {
    mon: [{ start: '09:00', end: '18:00' }],
    tue: [{ start: '09:00', end: '18:00' }],
    wed: [{ start: '09:00', end: '18:00' }],
    thu: [{ start: '09:00', end: '18:00' }],
    // The Jummah break is why working_days holds a list of intervals per day
    // rather than one start and one end.
    fri: [{ start: '09:00', end: '12:30' }, { start: '14:30', end: '18:00' }],
    sat: [{ start: '09:00', end: '18:00' }],
    sun: [],
  },
  is_default: true,
};

// Fixed-date national holidays only. Eid and Ashura follow the lunar calendar
// and move every year, so they are entered per year by an operator rather than
// seeded wrong. The year on a recurring row is an anchor, not a claim.
const HOLIDAYS = [
  { name: 'Kashmir Solidarity Day', holiday_date: '2026-02-05' },
  { name: 'Pakistan Day', holiday_date: '2026-03-23' },
  { name: 'Labour Day', holiday_date: '2026-05-01' },
  { name: 'Independence Day', holiday_date: '2026-08-14' },
  { name: 'Quaid-e-Azam Day', holiday_date: '2026-12-25' },
];

// A business day on the calendar above is nine hours, which is what the
// "business days" in spec §12.4's default table are converted against.
const BUSINESS_DAY_MINUTES = 9 * 60;

const SLA_POLICY = { key: 'standard', name: 'Standard Support', is_default: true };

const SLA_TARGETS = [
  {
    priority: 'urgent',
    first_response_minutes: 30,
    resolution_minutes: 4 * 60,
    escalation_steps: [
      { at_pct: 80, action: 'notify', to: 'assignee' },
      { at_pct: 100, action: 'notify', to: 'team_manager' },
      { at_pct: 150, action: 'notify', to: 'desk_manager' },
      { at_pct: 200, action: 'reassign', to: 'desk_manager' },
    ],
  },
  {
    priority: 'high',
    first_response_minutes: 60,
    resolution_minutes: 8 * 60,
    escalation_steps: [
      { at_pct: 80, action: 'notify', to: 'assignee' },
      { at_pct: 100, action: 'notify', to: 'team_manager' },
      { at_pct: 150, action: 'notify', to: 'desk_manager' },
      { at_pct: 200, action: 'reassign', to: 'desk_manager' },
    ],
  },
  {
    priority: 'normal',
    first_response_minutes: 4 * 60,
    resolution_minutes: 3 * BUSINESS_DAY_MINUTES,
    escalation_steps: [
      { at_pct: 80, action: 'notify', to: 'assignee' },
      { at_pct: 100, action: 'notify', to: 'team_manager' },
      { at_pct: 100, action: 'priority', to: 'high' },
      { at_pct: 150, action: 'notify', to: 'desk_manager' },
    ],
  },
  {
    priority: 'low',
    first_response_minutes: BUSINESS_DAY_MINUTES,
    resolution_minutes: 5 * BUSINESS_DAY_MINUTES,
    escalation_steps: [
      { at_pct: 80, action: 'notify', to: 'assignee' },
      { at_pct: 100, action: 'notify', to: 'team_manager' },
      { at_pct: 150, action: 'priority', to: 'normal' },
    ],
  },
];

/**
 * `category_map` lists the legacy contact_tickets.category values a desk
 * absorbs. The four live enum values are covered between Customer Support and
 * the three internal desks; migration 016 fails loudly if a value shows up that
 * nothing here claims.
 */
const DESK_ROWS = [
  {
    key: 'customer_support', name: 'Customer Support', sequence: 10,
    description: 'Storefront and marketplace customers.',
    allow_anonymous: true, csat_enabled: true,
    requester_kinds: ['customer', 'anonymous'],
    category_map: ['General'],
  },
  {
    key: 'it', name: 'IT', sequence: 20,
    description: 'Internal IT support and access requests.',
    require_resolution_note: true,
    requester_kinds: ['employee'],
    category_map: ['IT'],
  },
  {
    key: 'hr', name: 'HR', sequence: 30,
    description: 'Employee HR queries. Visible only to desk members and, where enabled, line managers.',
    // HR tickets are the most confidential traffic in the ERP; the desk is
    // closed by default rather than org-visible.
    visibility_mode: 'member_only',
    grant_line_manager_access: true, require_resolution_note: true,
    requester_kinds: ['employee'],
    category_map: ['HR'],
  },
  {
    key: 'facilities', name: 'Facilities', sequence: 40,
    description: 'Premises, utilities and workplace requests.',
    requester_kinds: ['employee'],
    category_map: ['Facilities'],
  },
  {
    key: 'field_service', name: 'Field Service', sequence: 50,
    description: 'On-site visits and installations.',
    requester_kinds: ['customer', 'employee'],
    category_map: [],
  },
  {
    key: 'warranty_rma', name: 'Warranty / RMA', sequence: 60,
    description: 'Warranty claims, returns and replacements.',
    require_resolution_note: true,
    requester_kinds: ['customer'],
    category_map: [],
  },
  {
    key: 'maintenance', name: 'Maintenance', sequence: 70,
    description: 'Scheduled and corrective maintenance of equipment and assets.',
    requester_kinds: ['employee'],
    category_map: [],
  },
];

// counts_as_resolved is what keeps the resolution rate honest: a duplicate or a
// customer who stopped replying is a legitimate ending, but not a resolution.
const RESOLUTION_CODE_ROWS = [
  { key: 'answered', name: 'Answered', counts_as_resolved: true, requires_note: false, sequence: 10 },
  { key: 'fixed', name: 'Fixed', counts_as_resolved: true, requires_note: false, sequence: 20 },
  { key: 'replacement_sent', name: 'Replacement Sent', counts_as_resolved: true, requires_note: true, sequence: 30 },
  { key: 'refund_issued', name: 'Refund Issued', counts_as_resolved: true, requires_note: true, sequence: 40 },
  { key: 'no_fault_found', name: 'No Fault Found', counts_as_resolved: true, requires_note: true, sequence: 50 },
  { key: 'known_issue', name: 'Known Issue', counts_as_resolved: true, requires_note: true, sequence: 60 },
  { key: 'duplicate', name: 'Duplicate', counts_as_resolved: false, requires_note: true, sequence: 70 },
  { key: 'no_response_from_customer', name: 'No Response From Customer', counts_as_resolved: false, requires_note: false, sequence: 80 },
  { key: 'out_of_scope', name: 'Out Of Scope', counts_as_resolved: false, requires_note: true, sequence: 90 },
];

function stamps(now) {
  return { document_id: generateDocumentId(), created_at: now, updated_at: now };
}

async function seedCalendar(knex, now) {
  const existing = await knex(CALENDARS).where({ key: CALENDAR.key }).first('id');
  if (existing) return { id: existing.id, created: 0 };
  const [id] = await knex(CALENDARS).insert({
    ...stamps(now),
    key: CALENDAR.key,
    name: CALENDAR.name,
    timezone: CALENDAR.timezone,
    working_days: JSON.stringify(CALENDAR.working_days),
    is_default: true,
    is_active: true,
  });
  return { id, created: 1 };
}

async function seedHolidays(knex, now, calendarId) {
  let created = 0;
  for (const holiday of HOLIDAYS) {
    const existing = await knex('helpdesk_holidays')
      .where({ calendar_id: calendarId, holiday_date: holiday.holiday_date })
      .first('id');
    if (existing) continue;
    await knex('helpdesk_holidays').insert({
      ...stamps(now),
      calendar_id: calendarId,
      name: holiday.name,
      holiday_date: holiday.holiday_date,
      is_recurring: true,
    });
    created += 1;
  }
  return created;
}

async function seedPolicy(knex, now, calendarId) {
  const existing = await knex(POLICIES).where({ key: SLA_POLICY.key }).first('id');
  if (existing) return { id: existing.id, created: 0 };
  const [id] = await knex(POLICIES).insert({
    ...stamps(now),
    key: SLA_POLICY.key,
    name: SLA_POLICY.name,
    desk_id: null,
    business_calendar_id: calendarId,
    pause_on_waiting: true,
    // Null = every stage the workflow marks as pausing, which is every stage
    // mapping to canonical waiting. Naming them here would freeze the list
    // against workflows that do not exist yet.
    pause_stages: null,
    is_default: true,
    is_active: true,
  });
  return { id, created: 1 };
}

async function seedTargets(knex, now, policyId) {
  let created = 0;
  for (const target of SLA_TARGETS) {
    const existing = await knex(TARGETS)
      .where({ policy_id: policyId, priority: target.priority })
      .first('id');
    if (existing) continue;
    await knex(TARGETS).insert({
      ...stamps(now),
      policy_id: policyId,
      priority: target.priority,
      first_response_minutes: target.first_response_minutes,
      resolution_minutes: target.resolution_minutes,
      at_risk_threshold_pct: 80,
      escalation_steps: JSON.stringify(target.escalation_steps),
    });
    created += 1;
  }
  return created;
}

async function seedWorkflow(knex) {
  if (!(await knex.schema.hasTable('workflows'))) {
    throw new Error('workflows table is missing — pos-strapi has not created its schema on this database');
  }
  const existing = await knex('workflows').where({ entity_uid: TICKET_UID }).first('id');
  if (existing) return { id: existing.id, created: 0 };
  // documents() rather than hand-written inserts: stages and transitions are
  // repeatable components, so a raw insert would have to reproduce the
  // component tables and the workflows_cmps join rows by hand. The shim reads
  // getDb(), which returns this migration's ambient transaction.
  const created = await documents(WF_UID).create({ data: WORKFLOW });
  return { id: created.id, created: 1 };
}

async function seedDesks(knex, now, refs) {
  let created = 0;
  let repaired = 0;
  for (const desk of DESK_ROWS) {
    const existing = await knex(DESKS)
      .where({ key: desk.key })
      .first('id', 'workflow_id', 'sla_policy_id', 'business_calendar_id');
    if (existing) {
      // RULE-7 repair: a run interrupted between the workflow and desk steps
      // leaves a desk that cannot legally be saved. Only null pointers are
      // touched, so an operator's own choice of workflow or policy survives.
      const patch = {};
      if (!existing.workflow_id) patch.workflow_id = refs.workflowId;
      if (!existing.sla_policy_id) patch.sla_policy_id = refs.policyId;
      if (!existing.business_calendar_id) patch.business_calendar_id = refs.calendarId;
      if (Object.keys(patch).length) {
        patch.updated_at = now;
        await knex(DESKS).where({ id: existing.id }).update(patch);
        repaired += 1;
      }
      continue;
    }
    await knex(DESKS).insert({
      ...stamps(now),
      key: desk.key,
      name: desk.name,
      description: desk.description || null,
      is_active: true,
      sequence: desk.sequence,
      visibility_mode: desk.visibility_mode || 'org_visible',
      default_priority: 'normal',
      default_assignee_id: null,
      default_team_id: null,
      workflow_id: refs.workflowId,
      sla_policy_id: refs.policyId,
      business_calendar_id: refs.calendarId,
      allow_anonymous: Boolean(desk.allow_anonymous),
      require_resolution_note: Boolean(desk.require_resolution_note),
      grant_line_manager_access: Boolean(desk.grant_line_manager_access),
      requester_kinds: JSON.stringify(desk.requester_kinds),
      reopen_window_days: 14,
      auto_close_after_days: 7,
      csat_enabled: Boolean(desk.csat_enabled),
      email_address: null,
      // Empty = every branch (spec §7.5).
      branch_ids: JSON.stringify([]),
      category_map: JSON.stringify(desk.category_map),
    });
    created += 1;
  }
  return { created, repaired };
}

/**
 * One team per desk, with NO MEMBERS — an operator adds people later.
 *
 * The routing pool is "the active members of the desk's active teams", so a desk
 * with no team at all has no candidates and can never route: every ticket falls
 * through to unassigned + helpdesk.ticket.routing_failed. An empty team does not
 * change that outcome on its own, and deliberately so — it is the row an
 * operator adds the first agent TO, and without it adding an agent means
 * inventing a team first, from a screen that may not exist yet.
 *
 * desk.default_team_id is left alone. Pointing it here would work, but the desk
 * default outranks skill and branch matching in team resolution (§14.2 step 2),
 * so the day a desk grows a second, specialised team the seeded catch-all would
 * silently keep winning. Team-less resolution already falls back to every active
 * team on the desk, which is exactly what one team per desk needs.
 *
 * manager_id is null, which is worth knowing when routing fails quietly: the
 * routing_failed event notifies the desk's team managers, falling back to the
 * desk's default assignee, and with neither set the notify list is empty. The
 * first real configuration step on a desk is naming a manager.
 */
async function seedTeams(knex, now) {
  const desks = await knex(DESKS)
    .whereIn('key', DESK_ROWS.map((desk) => desk.key))
    .select('id', 'key', 'name');

  let created = 0;
  for (const desk of desks) {
    const key = `${desk.key}_default`;
    // helpdesk_teams.key is unique across desks, so the natural key is the guard.
    const existing = await knex(TEAMS).where({ key }).first('id');
    if (existing) continue;
    await knex(TEAMS).insert({
      ...stamps(now),
      key,
      name: `${desk.name} Team`,
      desk_id: desk.id,
      manager_id: null,
      // Null, not an empty object: the team inherits the desk calendar's hours,
      // and an empty working_days would read as "never working" and make every
      // member fail the working_hours check.
      working_hours: null,
      skills: null,
      is_active: true,
      sequence: 10,
    });
    created += 1;
  }
  return created;
}

async function seedResolutionCodes(knex, now) {
  let created = 0;
  for (const code of RESOLUTION_CODE_ROWS) {
    // desk_id null means "every desk", and MySQL does not enforce the unique
    // index across NULLs — so the existence check is the real guard here.
    const existing = await knex(RESOLUTION_CODES)
      .where({ key: code.key })
      .whereNull('desk_id')
      .first('id');
    if (existing) continue;
    await knex(RESOLUTION_CODES).insert({
      ...stamps(now),
      key: code.key,
      name: code.name,
      desk_id: null,
      is_active: true,
      requires_note: code.requires_note,
      counts_as_resolved: code.counts_as_resolved,
      sequence: code.sequence,
    });
    created += 1;
  }
  return created;
}

module.exports = {
  name: '015-helpdesk-seed',

  async up(knex) {
    const now = new Date();

    const calendar = await seedCalendar(knex, now);
    const holidays = await seedHolidays(knex, now, calendar.id);
    const policy = await seedPolicy(knex, now, calendar.id);
    const targets = await seedTargets(knex, now, policy.id);
    const workflow = await seedWorkflow(knex);
    const desks = await seedDesks(knex, now, {
      workflowId: workflow.id,
      policyId: policy.id,
      calendarId: calendar.id,
    });
    // After the desks: the team rows are keyed off desk ids this step creates.
    const teams = await seedTeams(knex, now);
    const codes = await seedResolutionCodes(knex, now);

    console.log(
      `[migrate] helpdesk seed: calendars +${calendar.created}, holidays +${holidays}, ` +
      `policies +${policy.created}, targets +${targets}, workflows +${workflow.created}, ` +
      `desks +${desks.created} (${desks.repaired} repaired), teams +${teams}, ` +
      `resolution codes +${codes}`
    );
  },

  // One-way. Deleting seeded configuration would orphan every ticket pointing
  // at a desk, an SLA policy or the workflow — and by the time anyone wants to
  // undo this, those rows carry operator edits this file knows nothing about.
  // Roll the tables back with 011-014 on a database that has no tickets yet, or
  // correct the configuration with a new forward migration.
  down: null,
};
