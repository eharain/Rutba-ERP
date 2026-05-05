'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const {
  getAppRoleOptions,
  getEnabledPermissionGroups,
  sanitizeAppRolesForTeam,
  deriveTeamSlugFromData,
} = require('../../../../../packages/pos-shared/lib/endpoints/access-metadata.js');

async function resolveEmployeeForUser(strapi, user) {
  if (!user?.id) return null;

  const linked = await strapi.documents('api::hr-employee.hr-employee').findMany({
    filters: { user: { id: { $eq: user.id } } },
    fields: ['documentId', 'email'],
    pagination: { pageSize: 1 },
  });
  if (linked?.[0]) return linked[0];

  if (!user?.email) return null;
  const fallback = await strapi.documents('api::hr-employee.hr-employee').findMany({
    filters: { email: { $eqi: user.email } },
    fields: ['documentId', 'email'],
    pagination: { pageSize: 1 },
  });
  return fallback?.[0] || null;
}

function extractHrRolesFromTeam(team) {
  const roles = Array.isArray(team?.app_roles?.hr) ? team.app_roles.hr : [];
  const enabled = new Set(getEnabledPermissionGroups('hr'));
  return [...new Set(roles.filter((r) => enabled.has(String(r))))];
}

function isMemberOrManager(team, employeeDocumentId) {
  if (!team || !employeeDocumentId) return false;
  if (team.team_manager?.documentId === employeeDocumentId) return true;
  return (team.members || []).some((m) => m.documentId === employeeDocumentId);
}

async function getMembershipContext(strapi, user) {
  const employee = await resolveEmployeeForUser(strapi, user);
  if (!employee?.documentId) return { employee: null, teams: [], hrRoles: [] };

  const teams = await strapi.documents('api::hr-team.hr-team').findMany({
    filters: {
      $or: [
        { team_manager: { documentId: { $eq: employee.documentId } } },
        { members: { documentId: { $eq: employee.documentId } } },
      ],
    },
    fields: ['documentId', 'name', 'app_roles'],
    populate: ['team_manager', 'members'],
    pagination: { pageSize: 200 },
  });

  const roleSet = new Set();
  for (const team of teams || []) {
    for (const role of extractHrRolesFromTeam(team)) roleSet.add(role);
  }

  return { employee, teams: teams || [], hrRoles: [...roleSet] };
}

async function assertCanManageTeams(ctx, strapi, { requireTargetMembership = false } = {}) {
  const authUser = await strapi.query('plugin::users-permissions.user').findOne({
    where: { id: ctx.state?.user?.id },
    populate: {
      role: { select: ['type'] },
      permission_roles: {
        select: ['level'],
        populate: { domain: { select: ['key'] } },
      },
    },
  });

  if (!authUser) return { ok: false, reason: 'You must be logged in' };

  const roleType = authUser?.role?.type;
  if (roleType && roleType !== 'rutba_app_user') {
    return { ok: true, bypass: true };
  }

  const adminDomains = (authUser.permission_roles || [])
    .filter((r) => r?.level === 'admin')
    .map((r) => r?.domain?.key)
    .filter(Boolean);
  if (adminDomains.includes('hr') || adminDomains.includes('auth')) {
    return { ok: true, bypass: true };
  }

  const membership = await getMembershipContext(strapi, authUser);
  if (!membership.employee) {
    return { ok: false, reason: 'No linked HR employee found for current user' };
  }

  if (!membership.hrRoles.length) {
    return { ok: false, reason: 'HR team membership does not grant team management role' };
  }

  if (!requireTargetMembership) {
    return { ok: true, membership };
  }

  const targetDocumentId = ctx.params?.id;
  if (!targetDocumentId) return { ok: false, reason: 'Missing team identifier' };

  const target = await strapi.documents('api::hr-team.hr-team').findOne({
    documentId: targetDocumentId,
    fields: ['documentId', 'app_roles'],
    populate: ['team_manager', 'members'],
  });

  if (!target) {
    return { ok: false, reason: 'Team not found', notFound: true };
  }

  if (membership.hrRoles.includes('admin') || membership.hrRoles.includes('manager')) {
    return { ok: true, membership };
  }

  if (!isMemberOrManager(target, membership.employee.documentId)) {
    return { ok: false, reason: 'You can only modify teams where you are a member or manager' };
  }

  return { ok: true, membership };
}

module.exports = createCoreController('api::hr-team.hr-team', ({ strapi }) => ({
  async appRoleOptions(ctx) {
    return ctx.send({ data: getAppRoleOptions() });
  },

  async create(ctx) {
    const access = await assertCanManageTeams(ctx, strapi, { requireTargetMembership: false });
    if (!access.ok) return access.notFound ? ctx.notFound(access.reason) : ctx.forbidden(access.reason);

    const body = ctx.request.body || {};
    if (body?.data) {
      body.data.team_slug = deriveTeamSlugFromData(body.data);
      body.data.app_roles = sanitizeAppRolesForTeam(body.data.app_roles);
    }
    return await super.create(ctx);
  },

  async update(ctx) {
    const access = await assertCanManageTeams(ctx, strapi, { requireTargetMembership: true });
    if (!access.ok) return access.notFound ? ctx.notFound(access.reason) : ctx.forbidden(access.reason);

    const body = ctx.request.body || {};
    if (body?.data) {
      if (Object.prototype.hasOwnProperty.call(body.data, 'app_roles')) {
        body.data.app_roles = sanitizeAppRolesForTeam(body.data.app_roles);
      }
      if (Object.prototype.hasOwnProperty.call(body.data, 'team_slug') || Object.prototype.hasOwnProperty.call(body.data, 'name') || Object.prototype.hasOwnProperty.call(body.data, 'department')) {
        body.data.team_slug = deriveTeamSlugFromData(body.data);
      }
    }
    return await super.update(ctx);
  },
}));
