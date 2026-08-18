'use strict';

/**
 * The helpdesk's single authorization gate (spec 04 §4.4, spec 29 §29.9).
 *
 * Every TicketService and MessageService method calls into this file and
 * nothing else decides access. That is not tidiness — spec 29 §29.9 makes the
 * SERVICE layer the authoritative gate and HTTP merely the second one, because
 * a cross-desk read stopped only by a route policy is one refactor away from a
 * breach. A cron, an event handler, an AI action and an HTTP request all arrive
 * here through the same door.
 *
 * THE MODEL, all four ANDed (§4.4):
 *
 *     role capability  ∩  desk scope  ∩  branch scope  ∩  ownership
 *
 * `can()` is deliberately SYNCHRONOUS and pure over (actor, ticket, desk).
 * An async gate is a gate somebody eventually forgets to await, and
 * `if (can(...))` on a pending Promise is always true — a silent, total bypass.
 * Every fact the decision needs is therefore resolved up front by
 * resolveActor(), which is the only function here that touches the database.
 *
 * REQUESTERS ARE AUTHORISED BY IDENTITY, NEVER BY ROLE (§4.6). A customer holds
 * no helpdesk role; they reach their own ticket because the ticket's person,
 * user or employee is them. Every actor therefore carries the `requester` band
 * in addition to whatever roles they hold, which is also what lets an agent read
 * a ticket they raised on a desk they are not a member of.
 *
 * DESK MEMBERSHIP IS DERIVED FROM TEAMS. The delivered schema (migration 014)
 * has no desk-member table: membership is helpdesk_team_members → helpdesk_teams
 * → desk_id, plus a desk's own default_assignee. That is the whole definition,
 * in one place, so a future desk-member table changes this function and nothing
 * else.
 *
 * BRANCH SCOPE HAS NO SOURCE OF TRUTH IN CORE YET. Nothing in services/strapi maps a
 * user to a set of branches, so `actor.branchIds` is an input: an array narrows
 * every non-ownership grant to those branches, and null means unrestricted.
 * Null is the honest default — it preserves exactly today's behaviour rather
 * than inventing an entitlement, and it is a documented gap rather than a
 * silent one. Ownership is never narrowed by branch: a customer's own ticket is
 * theirs wherever it was raised.
 *
 * FAIL CLOSED. An unknown capability, a ticket whose desk cannot be loaded, a
 * ⚙️ capability whose enabling desk column does not exist — all deny. A gate
 * that silently stops gating is worse than one that visibly refuses.
 */

const { getDb } = require('../../../db/connection');
const { documents } = require('../../../documents');

class ForbiddenError extends Error {
  constructor(message) { super(message); this.name = 'ForbiddenError'; }
}

const PERSON_UID = 'api::person.person';
const EMPLOYEE_UID = 'api::hr-employee.hr-employee';

const DESKS = 'helpdesk_desks';
const TEAMS = 'helpdesk_teams';
const TEAM_MEMBERS = 'helpdesk_team_members';

const APP_ROLES = 'api_pro_app_roles';
const USER_APP_ROLES = 'up_users_app_roles_lnk';

/** `reports_to` is HR-editable and nothing stops a cycle, so the walk is bounded. */
const MAX_REPORTING_DEPTH = 10;
const REPORTING_PAGE = 1000;

const RESOLVED = Symbol('rutba.helpdesk.actor');

// api-pro role keys, per spec 04 §4.3. "Agent" is a display label over
// helpdesk_staff — there is no helpdesk_agent key, and inventing one would make
// requireAppRole's prefix matching disagree with the UI.
const BAND_BY_ROLE_KEY = {
  helpdesk_admin: 'admin',
  helpdesk_manager: 'manager',
  helpdesk_staff: 'agent',
  helpdesk_approver: 'approver',
  helpdesk_system: 'system',
};

const MACHINE_KINDS = new Set(['system', 'automation', 'ai']);

/**
 * Spec 29 §29.3–29.5 as data. Values are SCOPES, not booleans:
 *
 *   all      ✅ — the capability exists unscoped for that band
 *   desk     🔶 — desk scope decides, per the desk's visibility_mode
 *   own      🔶 — only when the actor is the ticket's requester
 *   setting  ⚙️ — only when a desk column enables it; see SETTING_COLUMN
 *   (absent) ❌ — denied
 *
 * Two capabilities are listed with no bands at all, on purpose: they are
 * permanently denied to every role including admin (RULE-13, §29.4), and having
 * them here says so out loud. Neither has a service method.
 */
const MATRIX = {
  'ticket.read': { admin: 'all', manager: 'desk', agent: 'desk', system: 'all', requester: 'own' },
  'ticket.create': { admin: 'all', manager: 'all', agent: 'all', system: 'all' },
  'ticket.create.own': { admin: 'all', manager: 'all', agent: 'all', approver: 'all', system: 'all', requester: 'all' },
  'ticket.update': { admin: 'all', manager: 'desk', agent: 'desk', system: 'desk' },
  'ticket.transition': { admin: 'all', manager: 'desk', agent: 'desk', system: 'desk' },
  // RULE-9: no machine actor may reach `resolved` under any configuration, so
  // the system band is absent here rather than scoped. See TicketService.
  'ticket.resolve': { admin: 'all', manager: 'desk', agent: 'desk' },
  'ticket.close': { admin: 'all', manager: 'desk', agent: 'desk', system: 'all', requester: 'own' },
  'ticket.reopen': { admin: 'all', manager: 'desk', agent: 'desk', system: 'desk', requester: 'own' },
  'ticket.cancel': { admin: 'all', manager: 'desk', agent: 'setting', requester: 'own' },
  'ticket.assign': { admin: 'all', manager: 'desk', system: 'desk' },
  'ticket.assign.self': { admin: 'all', manager: 'all', agent: 'desk' },
  'ticket.merge': { admin: 'all', manager: 'desk', agent: 'setting' },
  'ticket.split': { admin: 'all', manager: 'desk', agent: 'setting' },
  'ticket.priority': { admin: 'all', manager: 'desk', agent: 'desk', system: 'desk' },
  'ticket.desk.change': { admin: 'all', manager: 'desk', agent: 'setting', system: 'desk' },
  'ticket.subject.link': { admin: 'all', manager: 'desk', agent: 'desk', system: 'desk' },
  'ticket.archive': { admin: 'all' },
  'ticket.watch': { admin: 'all', manager: 'desk', agent: 'desk', approver: 'desk' },
  'ticket.participant.add': { admin: 'all', manager: 'desk', agent: 'desk' },
  'ticket.message.read.public': {
    admin: 'all', manager: 'desk', agent: 'desk', approver: 'desk', system: 'all', requester: 'own',
  },
  'ticket.message.read.internal': { admin: 'all', manager: 'desk', agent: 'desk', system: 'all' },
  'ticket.reply': { admin: 'all', manager: 'desk', agent: 'desk' },
  'ticket.reply.own': { requester: 'own' },
  'ticket.note.internal': { admin: 'all', manager: 'desk', agent: 'desk', system: 'all' },
  'ticket.message.redact': { admin: 'all' },
  'audit.read': { admin: 'all', manager: 'desk', agent: 'desk', requester: 'own' },

  // Permanently denied to every role, forever (RULE-13, §29.4).
  'ticket.delete': {},
  'ticket.message.edit': {},
};

/**
 * ⚙️ capabilities map to the desk column that enables them. The delivered desk
 * schema (migration 011) has no column for any of them, so they currently deny
 * — which is the direction to fail in, and the reason this is a lookup rather
 * than a hardcoded `false`: adding the column is then the whole change.
 */
const SETTING_COLUMN = {
  'ticket.cancel': 'allow_agent_cancel',
  'ticket.merge': 'allow_agent_merge',
  'ticket.split': 'allow_agent_split',
  'ticket.desk.change': 'allow_agent_desk_change',
};

/**
 * Capabilities that only READ. On an `org_visible` desk any authenticated agent
 * may read but only members may act (§4.4), and this set is what draws that
 * line.
 */
const READ_CAPABILITIES = new Set([
  'ticket.read',
  'ticket.message.read.public',
  'ticket.message.read.internal',
  'audit.read',
]);

const BAND_PRECEDENCE = ['admin', 'manager', 'agent', 'approver', 'system', 'requester'];

function toIdList(rows) {
  return rows.map((v) => Number(v)).filter((v) => Number.isFinite(v));
}

async function loadRoleKeys(userId) {
  const rows = await getDb()(`${USER_APP_ROLES} as l`)
    .join(`${APP_ROLES} as r`, 'r.id', 'l.app_role_id')
    .where('l.user_id', userId)
    // is_active defaults to true but predates some rows; a NULL is not a denial.
    .where(function activeOrUnset() { this.where('r.is_active', true).orWhereNull('r.is_active'); })
    .pluck('r.key');
  return [...new Set(rows.map((k) => String(k).trim().toLowerCase()).filter(Boolean))];
}

async function loadDeskIds(userId) {
  const viaTeams = await getDb()(`${TEAM_MEMBERS} as m`)
    .join(`${TEAMS} as t`, 't.id', 'm.team_id')
    .where('m.user_id', userId)
    .where('m.is_active', true)
    .where('t.is_active', true)
    .whereNotNull('t.desk_id')
    .distinct()
    .pluck('t.desk_id');
  const viaDefaultAssignee = await getDb()(DESKS)
    .where('default_assignee_id', userId)
    .pluck('id');
  return [...new Set(toIdList([...viaTeams, ...viaDefaultAssignee]))];
}

/**
 * Employee ids below this employee on the reporting line, for the desks that
 * set grant_line_manager_access (§4.5). Walked over `direct_reports` through
 * documents() rather than the link table so the traversal survives a rename of
 * Strapi's derived identifiers.
 *
 * The common case costs ONE query: an employee with no direct reports empties
 * the frontier on the first pass and returns.
 */
async function loadManagedEmployeeIds(employeeId) {
  const seen = new Set();
  let frontier = [employeeId];
  for (let depth = 0; depth < MAX_REPORTING_DEPTH && frontier.length; depth++) {
    const rows = await documents(EMPLOYEE_UID).findMany({
      filters: { reports_to: { id: { $in: frontier } } },
      fields: ['id'],
      limit: REPORTING_PAGE,
    });
    const next = [];
    for (const row of rows || []) {
      if (row.id && row.id !== employeeId && !seen.has(row.id)) {
        seen.add(row.id);
        next.push(row.id);
      }
    }
    frontier = next;
  }
  return [...seen];
}

async function anyDeskGrantsLineManagerAccess() {
  const row = await getDb()(DESKS)
    .where('is_active', true)
    .where('grant_line_manager_access', true)
    .first('id');
  return Boolean(row);
}

function bandsFor(roleKeys, kind) {
  const bands = new Set(['requester']);
  for (const key of roleKeys) {
    const band = BAND_BY_ROLE_KEY[key];
    if (band) bands.add(band);
  }
  if (MACHINE_KINDS.has(kind)) bands.add('system');
  return [...bands];
}

/**
 * The trusted internal actor for crons, event handlers and migrations. It holds
 * the `system` band and nothing else — which is why it can close a ticket the
 * auto-close sweep found and can NEVER resolve one (RULE-9): `ticket.resolve`
 * has no system entry in the matrix above.
 */
function systemActor(label, options = {}) {
  const actor = {
    id: null,
    documentId: null,
    label: label || 'system',
    kind: options.kind && MACHINE_KINDS.has(options.kind) ? options.kind : 'system',
    roleKeys: [],
    bands: ['requester', 'system'],
    personId: null,
    employeeId: null,
    branchIds: null,
    deskIds: [],
    managedEmployeeIds: [],
    source: options.source || 'system',
    ip: null,
    userAgent: null,
    correlationId: options.correlationId || null,
    ruleName: options.ruleName || null,
  };
  Object.defineProperty(actor, RESOLVED, { value: true, enumerable: false });
  return actor;
}

/**
 * Turn whatever the caller has — a ctx.state.user, a bare user id, an actor
 * already resolved by an earlier call — into the fact set `can()` needs.
 *
 * Idempotent: an actor that came out of here passes straight back through, so a
 * service method may be called from an HTTP handler or from another service
 * without either one having to know which.
 */
async function resolveActor(input, options = {}) {
  if (!input) return systemActor(options.label || 'anonymous', options);
  if (input[RESOLVED]) return input;

  const userId = typeof input === 'number' || typeof input === 'string'
    ? Number(input)
    : (input.id !== undefined && input.id !== null ? Number(input.id) : null);
  if (!Number.isFinite(userId)) {
    // A caller with contact details but no login: a genuine requester for
    // intake, entitled to nothing by role and owning nothing yet.
    //
    // Built by MUTATION, never by spreading systemActor's result: the RESOLVED
    // marker is defined non-enumerable, and a spread copies only own enumerable
    // properties. A guest that lost it would be re-resolved from scratch by
    // every downstream resolveActor(actor) — with an empty options bag — and the
    // public intake audit rows, the ones where provenance matters most, would
    // carry no ip, user agent or correlation id.
    const guest = systemActor(options.label || 'guest', { ...options, kind: 'system' });
    guest.bands = ['requester'];
    guest.kind = 'user';
    // systemActor hardcodes both to null because a cron has no request behind
    // it; a guest does, and it is the request this actor exists to describe.
    guest.ip = options.ip || null;
    guest.userAgent = options.userAgent || null;
    return guest;
  }

  const source = options.source || (typeof input === 'object' && input.source) || 'api';
  const roleKeys = await loadRoleKeys(userId);
  const deskIds = await loadDeskIds(userId);

  const person = await documents(PERSON_UID).findFirst({
    filters: { user: { id: { $eq: userId } } },
    fields: ['id'],
  });
  const employee = await documents(EMPLOYEE_UID).findFirst({
    filters: { user: { id: { $eq: userId } } },
    fields: ['id'],
  });

  let managedEmployeeIds = [];
  if (employee && employee.id && await anyDeskGrantsLineManagerAccess()) {
    managedEmployeeIds = await loadManagedEmployeeIds(employee.id);
  }

  const actor = {
    id: userId,
    documentId: typeof input === 'object' ? input.documentId || null : null,
    label: typeof input === 'object'
      ? (input.username || input.displayName || input.email || `user:${userId}`)
      : `user:${userId}`,
    kind: 'user',
    roleKeys,
    bands: bandsFor(roleKeys, 'user'),
    personId: person ? person.id : null,
    employeeId: employee ? employee.id : null,
    // See the file docblock: null = unrestricted, and it is a documented gap.
    branchIds: Array.isArray(options.branchIds) ? toIdList(options.branchIds) : null,
    deskIds,
    managedEmployeeIds,
    source,
    ip: options.ip || null,
    userAgent: options.userAgent || null,
    correlationId: options.correlationId || null,
    ruleName: options.ruleName || null,
  };
  Object.defineProperty(actor, RESOLVED, { value: true, enumerable: false });
  return actor;
}

function hasBand(actor, band) {
  return Boolean(actor && Array.isArray(actor.bands) && actor.bands.includes(band));
}

/** The ticket's requester, by identity — person first, then login, then employee. */
function isRequester(actor, ticket) {
  if (!actor || !ticket) return false;
  if (actor.personId && ticket.person_id && actor.personId === ticket.person_id) return true;
  if (actor.id && ticket.user_id && actor.id === ticket.user_id) return true;
  if (actor.employeeId && ticket.employee_id && actor.employeeId === ticket.employee_id) return true;
  return false;
}

/** The line-manager grant (§4.5): an additional grant on desks that opt in, never the general model. */
function isLineManagerOf(actor, ticket, desk) {
  if (!desk || !desk.grant_line_manager_access) return false;
  if (!ticket || !ticket.employee_id) return false;
  return Array.isArray(actor.managedEmployeeIds) && actor.managedEmployeeIds.includes(ticket.employee_id);
}

function branchAllows(actor, ticket) {
  if (!actor || !Array.isArray(actor.branchIds)) return true;
  if (!ticket || ticket.branch_id === null || ticket.branch_id === undefined) return true;
  return actor.branchIds.includes(ticket.branch_id);
}

/**
 * Desk scope for one band. `restricted` narrows AGENTS to their own and
 * unassigned tickets; managers and admins of that desk still see it whole,
 * because a desk nobody can supervise is not a control, it is a blind spot.
 */
function deskAllows(actor, band, capability, ticket, desk) {
  if (!desk) return false;
  // A machine actor holds no desk memberships by construction, so scoping it by
  // membership would make every 🔶 capability the matrix grants the system band
  // permanently unreachable — the auto-close sweep, the requester-reply resume
  // and every automation transition included. What a machine may do is fixed by
  // the matrix, not by which desks it belongs to, and RULE-9 is enforced by
  // `ticket.resolve` having no system entry there at all rather than by this.
  if (band === 'system') return true;
  const mode = desk.visibility_mode || 'org_visible';
  const member = Array.isArray(actor.deskIds) && actor.deskIds.includes(desk.id);
  if (!member) {
    return mode === 'org_visible' && READ_CAPABILITIES.has(capability);
  }
  if (mode === 'restricted' && band === 'agent' && ticket) {
    const assignee = ticket.assigned_to_id;
    return assignee === null || assignee === undefined || assignee === actor.id;
  }
  return true;
}

function settingAllows(capability, desk) {
  const column = SETTING_COLUMN[capability];
  if (!column || !desk) return false;
  return desk[column] === true || desk[column] === 1;
}

function scopeAllows(actor, band, scope, capability, ticket, desk) {
  switch (scope) {
    case 'all':
      return true;
    case 'desk':
      return deskAllows(actor, band, capability, ticket, desk);
    case 'own':
      return isRequester(actor, ticket) || isLineManagerOf(actor, ticket, desk);
    case 'setting':
      return settingAllows(capability, desk) && deskAllows(actor, band, capability, ticket, desk);
    default:
      return false;
  }
}

/**
 * May this actor do this to this ticket? Pass the ticket and its desk for every
 * row-level decision; omit both only for capability questions that have no row
 * yet (ticket.create).
 *
 * Ownership grants are NOT narrowed by branch scope — a requester's own ticket
 * is theirs wherever it was raised — while every role-derived grant is.
 */
function can(actor, capability, context = {}) {
  if (!actor) return false;
  const bands = MATRIX[capability];
  if (!bands) return false;
  const { ticket = null, desk = null } = context;

  for (const band of BAND_PRECEDENCE) {
    if (!hasBand(actor, band)) continue;
    const scope = bands[band];
    if (!scope) continue;
    if (!scopeAllows(actor, band, scope, capability, ticket, desk)) continue;
    if (scope === 'own') return true;
    return branchAllows(actor, ticket);
  }
  return false;
}

/**
 * The form services call. Throwing rather than returning false is what keeps a
 * missing check visible: a service method that forgets to branch on `can()`
 * still fails closed if it called assertCan.
 */
function assertCan(actor, capability, context = {}) {
  if (can(actor, capability, context)) return true;
  const subject = context.ticket && context.ticket.documentId ? ` on ${context.ticket.documentId}` : '';
  throw new ForbiddenError(`Not permitted: ${capability}${subject}`);
}

/**
 * The READ MODEL's half of the same rules (§29.9 rule 3): row scoping belongs
 * in the query, never in a filter applied after fetch, because a post-fetch
 * filter still leaks through counts and pagination totals.
 *
 * Returns a documents()-dialect filter, or NULL meaning "this actor may see
 * nothing" — the caller must return an empty page for null and must never
 * treat it as "no filter".
 *
 * `desks` is every active desk (single digits of rows); each is classified once
 * so the resulting filter is a flat set of id lists rather than a per-row
 * decision the database cannot make.
 */
function buildScopeFilter(actor, desks = []) {
  if (!actor) return null;
  if (hasBand(actor, 'admin') || hasBand(actor, 'system')) return {};

  const clauses = [];
  const band = hasBand(actor, 'manager') ? 'manager' : (hasBand(actor, 'agent') ? 'agent' : null);
  if (band) {
    const openDeskIds = [];
    const restrictedDeskIds = [];
    for (const desk of desks) {
      const mode = desk.visibility_mode || 'org_visible';
      const member = Array.isArray(actor.deskIds) && actor.deskIds.includes(desk.id);
      if (member && mode === 'restricted' && band === 'agent') restrictedDeskIds.push(desk.id);
      else if (member || mode === 'org_visible') openDeskIds.push(desk.id);
    }
    if (openDeskIds.length) clauses.push({ desk_id: { $in: openDeskIds } });
    if (restrictedDeskIds.length) {
      clauses.push({
        $and: [
          { desk_id: { $in: restrictedDeskIds } },
          { $or: [{ assigned_to: null }, { assigned_to: { id: { $eq: actor.id } } }] },
        ],
      });
    }
  }

  const lineManagerDeskIds = desks.filter((d) => d.grant_line_manager_access).map((d) => d.id);
  if (lineManagerDeskIds.length && actor.managedEmployeeIds && actor.managedEmployeeIds.length) {
    clauses.push({
      $and: [
        { desk_id: { $in: lineManagerDeskIds } },
        { employee: { id: { $in: actor.managedEmployeeIds } } },
      ],
    });
  }

  const own = [];
  if (actor.personId) own.push({ person: { id: { $eq: actor.personId } } });
  if (actor.id) own.push({ user: { id: { $eq: actor.id } } });
  if (actor.employeeId) own.push({ employee: { id: { $eq: actor.employeeId } } });
  if (own.length) clauses.push(own.length === 1 ? own[0] : { $or: own });

  if (!clauses.length) return null;
  const scoped = clauses.length === 1 ? clauses[0] : { $or: clauses };
  if (!Array.isArray(actor.branchIds)) return scoped;
  // A ticket with no branch belongs to no branch and stays visible; anything
  // stamped with a branch must be one the actor holds.
  return {
    $and: [
      scoped,
      { $or: [{ branch_id: { $null: true } }, { branch_id: { $in: actor.branchIds } }] },
    ],
  };
}

/** Audit `source` per spec 30 §30.3 A3 — human, machine, or which machine. */
function auditSource(actor) {
  if (!actor) return 'system';
  if (actor.source) return actor.source;
  return MACHINE_KINDS.has(actor.kind) ? actor.kind : 'api';
}

/** The event-envelope actor (spec 28 §28.4). */
function eventActor(actor) {
  if (!actor) return { type: 'system', id: null, label: 'system' };
  const type = MACHINE_KINDS.has(actor.kind) ? actor.kind : (actor.id ? 'user' : 'system');
  return { type, id: actor.id, label: actor.label };
}

module.exports = {
  resolveActor,
  systemActor,
  can,
  assertCan,
  hasBand,
  isRequester,
  isLineManagerOf,
  buildScopeFilter,
  auditSource,
  eventActor,
  ForbiddenError,
  MATRIX,
  MACHINE_KINDS,
  READ_CAPABILITIES,
};
