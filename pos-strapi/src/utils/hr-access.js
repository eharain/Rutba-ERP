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

module.exports = {
  resolveEmployeeForUser,
  isHrManager,
  managedReportDocIds,
};
