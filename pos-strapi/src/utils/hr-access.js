'use strict';

/**
 * Shared HR authorization helpers.
 *
 * HR access has two independent axes (see the org model):
 *   1. Functional role (api-pro app-role): hr_staff / hr_manager / hr_admin —
 *      WHAT you can do. Gated at the endpoint by api-pro policies.
 *   2. Organizational position (relationships): are you the `team_manager`
 *      of the team(s) a target employee belongs to — WHICH records you may act
 *      on. Resolved here from the hr-team graph (team_manager / members /
 *      parent_team→child_teams), NOT from a role.
 *
 * An HR manager/admin (active hr_admin/hr_manager claim) acts org-wide; a line
 * manager (an ess_manager, or anyone who is a team_manager) acts only on their
 * reports; an employee acts only on themselves.
 */

const TEAM_UID = 'api::hr-team.hr-team';
const EMP_UID = 'api::hr-employee.hr-employee';

/** The caller's hr-employee record (via the user link, then email fallback). */
async function resolveEmployeeForUser(strapi, user) {
  if (!user?.id) return null;
  const linked = await strapi.documents(EMP_UID).findMany({
    filters: { user: { id: { $eq: user.id } } },
    fields: ['documentId', 'name', 'email'],
    pagination: { pageSize: 1 },
  });
  if (linked?.[0]) return linked[0];
  if (!user?.email) return null;
  const byEmail = await strapi.documents(EMP_UID).findMany({
    filters: { email: { $eqi: user.email } },
    fields: ['documentId', 'name', 'email'],
    pagination: { pageSize: 1 },
  });
  return byEmail?.[0] || null;
}

function deriveEmployeeNameFromUser(user) {
  const base = String(user?.username || user?.email || 'Employee').split('@')[0];
  const cleaned = base.replace(/[._-]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
  return cleaned || 'Employee';
}

/**
 * The caller's hr-employee record, auto-provisioning one on first touch if
 * none exists. Any authenticated user who reaches an ESS self-service action
 * (apply for leave, view my attendance/payslips/profile) is, by definition,
 * an employee — without this, a user with no hr-employee link/email-match
 * (e.g. an account whose app-roles were granted directly rather than via HR
 * onboarding) could still pass the api-pro approle gate but silently create
 * "orphaned" records with no `employee` link, which then can never be found
 * by myRequests/myAttendance/myPayslips again.
 *
 * ONLY call this from actual ESS self-service entry points, never from a
 * role provider (resolveHrRolesForUser / resolveEssRolesForUser run on every
 * authenticated request across every app — auto-creating there would spawn
 * an hr-employee row for every POS/CRM/etc. user in the system) or from a
 * check that resolves someone else's employee record.
 */
async function resolveOrCreateEmployeeForUser(strapi, user) {
  const existing = await resolveEmployeeForUser(strapi, user);
  if (existing) return existing;
  if (!user?.id) return null;

  try {
    return await strapi.documents(EMP_UID).create({
      data: { name: deriveEmployeeNameFromUser(user), email: user.email || null, user: user.id },
      fields: ['documentId', 'name', 'email'],
    });
  } catch (err) {
    // Lost a create race (concurrent first touch) — someone else just linked
    // this user; re-resolve rather than leaving the caller with nothing.
    const retried = await resolveEmployeeForUser(strapi, user);
    if (retried) return retried;
    strapi.log.error(`[hr-access] auto-provision employee failed for user ${user.id}: ${err.message}`);
    return null;
  }
}

// Active-claim role keys that carry org-wide HR authority.
const HR_MANAGER_ROLE_KEYS = new Set(['hr_admin', 'hr_manager']);

/**
 * Org-wide HR authority for the CURRENT request. True for a Strapi super-admin,
 * or when the active api-pro claim is an HR admin/manager role.
 *
 * Keyed to the single ACTIVE claim (ctx.state.apiProClaim, set by the api-pro
 * request interceptor) — NOT the user's full role set. This respects the
 * "one claimed role applies" model and prevents authority bleeding in from an
 * unrelated role the user happens to hold (e.g. an auth-domain admin). A line
 * manager (ess_manager, or anyone who is a team_manager) is intentionally NOT
 * org-wide here — they are scoped to their reports via managedReportDocIds.
 */
function isHrManager(ctx, user) {
  if (user?.role?.type === 'admin') return true; // Strapi super-admin
  const roleKey = ctx?.state?.apiProClaim?.roleKey;
  return roleKey ? HR_MANAGER_ROLE_KEYS.has(roleKey) : false;
}

/**
 * Employee documentIds the given employee manages as a line manager: members
 * (and sub-managers) of every team they are `team_manager` of, transitively
 * down the `parent_team` → `child_teams` hierarchy. Excludes the manager.
 * Returns [] when the employee manages nothing.
 */
async function managedReportDocIds(strapi, employeeDocId) {
  if (!employeeDocId) return [];

  const seed = await strapi.documents(TEAM_UID).findMany({
    filters: { team_manager: { documentId: { $eq: employeeDocId } } },
    fields: ['documentId'],
    pagination: { pageSize: 500 },
  });
  const teamDocIds = new Set((seed || []).map((t) => t.documentId).filter(Boolean));
  if (!teamDocIds.size) return [];

  // Expand descendants (bounded BFS over child_teams).
  let frontier = Array.from(teamDocIds);
  for (let depth = 0; depth < 10 && frontier.length; depth++) {
    const rows = await strapi.documents(TEAM_UID).findMany({
      filters: { documentId: { $in: frontier } },
      fields: ['documentId'],
      populate: { child_teams: { fields: ['documentId'] } },
      pagination: { pageSize: 1000 },
    });
    const next = [];
    for (const r of rows) {
      for (const c of (r.child_teams || [])) {
        if (c.documentId && !teamDocIds.has(c.documentId)) { teamDocIds.add(c.documentId); next.push(c.documentId); }
      }
    }
    frontier = next;
  }

  // Members + sub-managers of all in-scope teams are the reports.
  const teams = await strapi.documents(TEAM_UID).findMany({
    filters: { documentId: { $in: Array.from(teamDocIds) } },
    fields: ['documentId'],
    populate: { members: { fields: ['documentId'] }, team_manager: { fields: ['documentId'] } },
    pagination: { pageSize: 1000 },
  });
  const reports = new Set();
  for (const t of teams) {
    for (const m of (t.members || [])) if (m.documentId) reports.add(m.documentId);
    if (t.team_manager?.documentId) reports.add(t.team_manager.documentId);
  }
  reports.delete(employeeDocId);
  return Array.from(reports);
}

// Normalise however a relation arrives on a write payload -> {id}|{documentId}|null.
function relTargetKey(v) {
  if (v == null) return null;
  if (typeof v === 'number') return { id: v };
  if (typeof v === 'string') return { documentId: v };
  if (Array.isArray(v)) return v.length ? relTargetKey(v[0]) : null;
  if (typeof v === 'object') {
    if (v.id != null) return { id: v.id };
    if (v.documentId != null) return { documentId: v.documentId };
    if (v.connect != null) return relTargetKey(v.connect);
    if (v.set != null) return relTargetKey(v.set);
  }
  return null;
}

/**
 * The user id linked to an `employee` relation value as it appears on a raw
 * write payload (id, documentId, or Strapi 5's {connect:[...]} shape). Used to
 * mirror the repo-wide `owners` convention onto hr-leave-request/hr-attendance/
 * pay-payslip without changing how self/report scoping is actually enforced
 * (that stays on the `employee` relation — see hr-access.js file doc).
 */
async function ownerUserIdForEmployeeRef(strapi, employeeRef) {
  const target = relTargetKey(employeeRef);
  if (!target) return null;
  const where = target.id != null ? { id: target.id } : { documentId: target.documentId };
  const emp = await strapi.db.query(EMP_UID).findOne({
    where,
    select: ['id'],
    populate: { user: { select: ['id'] } },
  });
  return emp?.user?.id || null;
}

/**
 * User ids of the given employee's direct line manager(s): the `team_manager`
 * of every team they are a `members` of. Used to route "X submitted for your
 * approval"-style notifications — not for authorization (see managedReportDocIds
 * for the enforcement-side check).
 */
async function managerUserIdsForEmployee(strapi, employeeDocId) {
  if (!employeeDocId) return [];
  const teams = await strapi.documents(TEAM_UID).findMany({
    filters: { members: { documentId: { $eq: employeeDocId } } },
    fields: ['documentId'],
    populate: { team_manager: { fields: ['documentId'], populate: { user: { fields: ['id'] } } } },
    pagination: { pageSize: 50 },
  });
  const userIds = new Set();
  for (const t of teams || []) {
    const uid = t.team_manager?.user?.id;
    if (uid) userIds.add(uid);
  }
  return Array.from(userIds);
}

module.exports = {
  resolveEmployeeForUser,
  resolveOrCreateEmployeeForUser,
  isHrManager,
  managedReportDocIds,
  managerUserIdsForEmployee,
  ownerUserIdForEmployeeRef,
};
