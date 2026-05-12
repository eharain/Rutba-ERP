// @ts-nocheck
'use strict';

// HR team-role provider for api-pro.
//
// Registered with `strapi.apiPro.registerRoleProvider(fn)` from src/index.js
// bootstrap. The api-pro plugin invokes this provider when resolving the
// permission set for a user — it returns any `hr_*` role keys the user
// inherits via their hr-employee → hr-team membership.
//
// Mirrors the logic in api/hr-team/controllers/hr-team.js:getMembershipContext()
// but doesn't depend on that file (which is a Strapi-managed controller).

async function resolveEmployeeForUser(strapi, user) {
  if (!user?.id) return null;

  const linked = await strapi.documents('api::hr-employee.hr-employee').findMany({
    filters: { user: { id: { $eq: user.id } } },
    fields: ['documentId'],
    pagination: { pageSize: 1 },
  });
  if (linked?.[0]) return linked[0];

  if (!user?.email) return null;
  const fallback = await strapi.documents('api::hr-employee.hr-employee').findMany({
    filters: { email: { $eqi: user.email } },
    fields: ['documentId'],
    pagination: { pageSize: 1 },
  });
  return fallback?.[0] || null;
}

function extractHrRolesFromTeam(team) {
  const roles = Array.isArray(team?.app_roles) ? team.app_roles : [];
  return roles.filter((r) => typeof r === 'string' && r.startsWith('hr_'));
}

async function resolveHrRolesForUser(user, { strapi }) {
  try {
    const employee = await resolveEmployeeForUser(strapi, user);
    if (!employee?.documentId) return [];

    const teams = await strapi.documents('api::hr-team.hr-team').findMany({
      filters: {
        $or: [
          { team_manager: { documentId: { $eq: employee.documentId } } },
          { members: { documentId: { $eq: employee.documentId } } },
        ],
      },
      fields: ['app_roles'],
      pagination: { pageSize: 200 },
    });

    const out = new Set();
    for (const team of teams || []) {
      for (const role of extractHrRolesFromTeam(team)) out.add(role);
    }
    return Array.from(out);
  } catch (error) {
    strapi.log.warn(`[hr-role-provider] resolve failed: ${error?.message}`);
    return [];
  }
}

module.exports = { resolveHrRolesForUser };
