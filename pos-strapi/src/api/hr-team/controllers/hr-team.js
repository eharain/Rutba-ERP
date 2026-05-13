// @ts-nocheck
'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

// â”€â”€ Local slug derivation (no external dependency) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function deriveTeamSlugFromData(data) {
  const explicit = String(data?.team_slug || '').trim();
  if (explicit) return explicit.toLowerCase();
  const byDepartment = String(data?.department?.name || data?.departmentName || '').trim();
  if (byDepartment) {
    return byDepartment.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  const byName = String(data?.name || '').trim();
  return byName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// â”€â”€ Validate submitted app_roles against actual guard role keys in DB â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function sanitizeAppRolesForTeam(strapi, appRoles) {
  if (!Array.isArray(appRoles)) return [];
  const keys = [...new Set(appRoles.map((k) => String(k).trim()).filter(Boolean))];
  if (!keys.length) return [];
  const valid = await strapi.db.query('plugin::api-pro.app-role').findMany({
    where: { key: { $in: keys }, isActive: true },
    select: ['key'],
  });
  return valid.map((r) => r.key);
}

// â”€â”€ Return all guard domains with their roles for team assignment UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function getAppRoleOptions(strapi) {
  const domains = await strapi.db.query('plugin::api-pro.app-domain').findMany({
    where: { isActive: true },
    populate: { appRoles: { where: { isActive: true }, select: ['key', 'name'] } },
    select: ['key', 'name', 'description'],
  });
  return domains
    .filter((d) => d.key !== 'default')
    .map((d) => ({
      domainKey: d.key,
      domainName: d.name,
      description: d.description,
      roles: (d.appRoles || []).map((r) => ({ key: r.key, name: r.name || r.key })),
    }));
}

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
  // app_roles is now a flat array of guard role keys e.g. ["hr_staff","hr_admin"]
  const roles = Array.isArray(team?.app_roles) ? team.app_roles : [];
  return [...new Set(roles.filter((r) => String(r).startsWith('hr_')))];
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
    populate: { role: { select: ['type'] } },
  });

  if (!authUser) return { ok: false, reason: 'You must be logged in' };

  const roleType = authUser?.role?.type;
  if (roleType && roleType !== 'rutba_app_user') {
    return { ok: true, bypass: true };
  }

  // Check if the user holds hr_admin or auth_admin guard role via their teams
  const hrEmployee = await strapi.db.query('api::hr-employee.hr-employee').findOne({
    where: { user: { id: authUser.id } },
    select: ['id'],
  });
  if (hrEmployee) {
    const teams = await strapi.db.query('api::hr-team.hr-team').findMany({
      where: { members: { id: hrEmployee.id } },
      select: ['id', 'app_roles'],
    });
    const allRoleKeys = teams.flatMap((t) => (Array.isArray(t.app_roles) ? t.app_roles : []));
    if (allRoleKeys.includes('hr_admin') || allRoleKeys.includes('auth_admin')) {
      return { ok: true, bypass: true };
    }
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
    const data = await getAppRoleOptions(strapi);
    return ctx.send({ data });
  },

  async create(ctx) {
    const access = await assertCanManageTeams(ctx, strapi, { requireTargetMembership: false });
    if (!access.ok) return access.notFound ? ctx.notFound(access.reason) : ctx.forbidden(access.reason);

    const body = ctx.request.body || {};
    if (body?.data) {
      body.data.team_slug = deriveTeamSlugFromData(body.data);
      body.data.app_roles = await sanitizeAppRolesForTeam(strapi, body.data.app_roles);
    }
    return await super.create(ctx);
  },

  async update(ctx) {
    const access = await assertCanManageTeams(ctx, strapi, { requireTargetMembership: true });
    if (!access.ok) return access.notFound ? ctx.notFound(access.reason) : ctx.forbidden(access.reason);

    const body = ctx.request.body || {};
    if (body?.data) {
      if (Object.prototype.hasOwnProperty.call(body.data, 'app_roles')) {
        body.data.app_roles = await sanitizeAppRolesForTeam(strapi, body.data.app_roles);
      }
      if (Object.prototype.hasOwnProperty.call(body.data, 'team_slug') || Object.prototype.hasOwnProperty.call(body.data, 'name') || Object.prototype.hasOwnProperty.call(body.data, 'department')) {
        body.data.team_slug = deriveTeamSlugFromData(body.data);
      }
    }
    return await super.update(ctx);
  },
}));
