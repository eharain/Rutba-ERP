// @ts-nocheck
'use strict';

// ESS role provider for api-pro.
//
// Registered with `strapi.apiPro.registerRoleProvider(fn)` from src/index.js
// bootstrap, alongside the HR role provider (hr-role-provider.js). Derives
// ess_employee / ess_manager live from relational position instead of a
// persisted grant, so they stay accurate automatically as hr-employee links
// and hr-team.team_manager assignments change:
//   - linked to an hr-employee record  -> ess_employee
//   - team_manager of any hr-team row  -> ess_manager
//
// See hr-access.js for the shared employee/manager resolution helpers this
// mirrors at request time (managedReportDocIds does the actual report-scope
// filtering once the role is claimed; this provider only decides whether the
// role can be claimed at all).

const { resolveEmployeeForUser } = require('./hr-access');

const TEAM_UID = 'api::hr-team.hr-team';

async function resolveEssRolesForUser(user, { strapi }) {
  try {
    const employee = await resolveEmployeeForUser(strapi, user);
    if (!employee?.documentId) return [];

    const roles = ['ess_employee'];

    const managedTeams = await strapi.documents(TEAM_UID).findMany({
      filters: { team_manager: { documentId: { $eq: employee.documentId } } },
      fields: ['documentId'],
      pagination: { pageSize: 1 },
    });
    if (managedTeams?.length) roles.push('ess_manager');

    return roles;
  } catch (error) {
    strapi.log.warn(`[ess-role-provider] resolve failed: ${error?.message}`);
    return [];
  }
}

module.exports = { resolveEssRolesForUser };
