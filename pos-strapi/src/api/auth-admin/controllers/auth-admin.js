// @ts-nocheck
'use strict';

const { ensureUser } = require('../../../utils/ensure-user');
const { mapLegacyAccessToPermissionRoles } = require('../../../utils/permission-role-migration');

const AUTH_APP_KEY = 'auth';

function sanitizeUser(user) {
  if (!user) return user;
  const {
    password,
    resetPasswordToken,
    confirmationToken,
    ...safe
  } = user;
  return safe;
}

function deriveDomainAccessFromUser(user) {
  const roles = user?.permission_roles || [];

  const appKeys = [...new Set(
    roles
      .map((role) => role?.domain?.key)
      .filter(Boolean)
  )];

  const adminKeys = [...new Set(
    roles
      .filter((role) => role?.level === 'admin')
      .map((role) => role?.domain?.key)
      .filter(Boolean)
  )];

  return { appKeys, adminKeys };
}

async function resolveDomainKeys(strapi, values = []) {
  const normalized = (values || []).map((v) => {
    if (v && typeof v === 'object') {
      return String(v.key || v.id || '').trim();
    }
    return String(v || '').trim();
  }).filter(Boolean);

  const directKeys = normalized.filter((v) => Number.isNaN(Number(v))).map((v) => v.toLowerCase());
  const numericIds = normalized
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (numericIds.length === 0) {
    return [...new Set(directKeys)];
  }

  const domains = await strapi.db.query('plugin::api-guard-pro.domain').findMany({
    where: { id: { $in: numericIds } },
    select: ['key'],
  });

  const idKeys = (domains || []).map((domain) => String(domain.key || '').toLowerCase()).filter(Boolean);
  return [...new Set([...directKeys, ...idKeys])];
}

async function requireAuthAdmin(ctx, strapi) {
  const user = await ensureUser(ctx, strapi);
  if (!user) return null;

  const appName = (ctx.request.headers['x-rutba-app'] || '').trim().toLowerCase();
  if (appName !== AUTH_APP_KEY) {
    ctx.forbidden('This endpoint is only available from the auth app context.');
    return null;
  }

  const fullUser = await strapi.query('plugin::users-permissions.user').findOne({
    where: { id: user.id },
    populate: {
      permission_roles: {
        select: ['level'],
        populate: {
          domain: { select: ['key'] },
        },
      },
    },
  });

  const isAuthAdmin = (fullUser?.permission_roles || []).some((role) =>
    role?.level === 'admin' && role?.domain?.key === AUTH_APP_KEY
  );
  if (!isAuthAdmin) {
    ctx.forbidden('Auth app admin access is required.');
    return null;
  }

  return fullUser;
}

async function fetchUserById(strapi, id) {
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: {
      role: true,
      permission_roles: {
        populate: {
          domain: true,
        },
      },
    },
  });
}

async function listDomainsWithUserCounts(strapi) {
  const domains = await strapi.db.query('plugin::api-guard-pro.domain').findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: ['id', 'documentId', 'key', 'name', 'description', 'strapiRoleType'],
  });

  const users = await strapi.query('plugin::users-permissions.user').findMany({
    populate: {
      permission_roles: {
        populate: {
          domain: {
            select: ['key'],
          },
        },
      },
    },
  });

  const usersByDomainKey = new Map();
  for (const user of users || []) {
    const domainKeys = new Set(
      (user.permission_roles || [])
        .map((role) => role?.domain?.key)
        .filter(Boolean)
    );

    for (const domainKey of domainKeys) {
      usersByDomainKey.set(domainKey, (usersByDomainKey.get(domainKey) || 0) + 1);
    }
  }

  return (domains || []).map((domain) => ({
    ...domain,
    userCount: usersByDomainKey.get(domain.key) || 0,
  }));
}

module.exports = {
  async listUsers(ctx) {
    const allowed = await requireAuthAdmin(ctx, strapi);
    if (!allowed) return;

    const users = await strapi.query('plugin::users-permissions.user').findMany({
      populate: {
        role: true,
        permission_roles: {
          populate: {
            domain: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    ctx.send((users || []).map((user) => {
      const { appKeys, adminKeys } = deriveDomainAccessFromUser(user);
      return sanitizeUser({
        ...user,
        domain_accesses: appKeys,
        admin_domain_accesses: adminKeys,
      });
    }));
  },

  async getUser(ctx) {
    const allowed = await requireAuthAdmin(ctx, strapi);
    if (!allowed) return;

    const id = Number(ctx.params.id);
    if (!id) return ctx.badRequest('Invalid user id.');

    const user = await fetchUserById(strapi, id);
    if (!user) return ctx.notFound('User not found.');

    const { appKeys, adminKeys } = deriveDomainAccessFromUser(user);
    ctx.send(sanitizeUser({
      ...user,
      domain_accesses: appKeys,
      admin_domain_accesses: adminKeys,
    }));
  },

  async createUser(ctx) {
    const allowed = await requireAuthAdmin(ctx, strapi);
    if (!allowed) return;

    const payload = ctx.request.body || {};
    const userService = strapi.plugin('users-permissions').service('user');

    const appAccesses = await resolveDomainKeys(strapi, payload.domain_accesses || []);
    const adminAppAccesses = await resolveDomainKeys(strapi, payload.admin_domain_accesses || []);

    const { roleIds } = await mapLegacyAccessToPermissionRoles(strapi, {
      appKeys: appAccesses,
      adminKeys: adminAppAccesses,
    });

    const created = await userService.add({
      username: payload.username,
      email: payload.email,
      password: payload.password,
      provider: 'local',
      displayName: payload.displayName,
      confirmed: payload.confirmed,
      blocked: payload.blocked,
      role: payload.role,
      permission_roles: roleIds,
    });

    const user = await fetchUserById(strapi, created.id);
    ctx.send(sanitizeUser(user));
  },

  async updateUser(ctx) {
    const allowed = await requireAuthAdmin(ctx, strapi);
    if (!allowed) return;

    const id = Number(ctx.params.id);
    if (!id) return ctx.badRequest('Invalid user id.');

    const payload = ctx.request.body || {};
    const userService = strapi.plugin('users-permissions').service('user');
    const appAccesses = await resolveDomainKeys(strapi, payload.domain_accesses || []);
    const adminAppAccesses = await resolveDomainKeys(strapi, payload.admin_domain_accesses || []);

    const { roleIds } = await mapLegacyAccessToPermissionRoles(strapi, {
      appKeys: appAccesses,
      adminKeys: adminAppAccesses,
    });

    const nextData = {
      username: payload.username,
      email: payload.email,
      provider: payload.provider || 'local',
      displayName: payload.displayName,
      confirmed: payload.confirmed,
      blocked: payload.blocked,
      role: payload.role,
      permission_roles: roleIds,
    };

    if (payload.password) {
      nextData.password = payload.password;
    }

    await userService.edit(id, nextData);

    const user = await fetchUserById(strapi, id);
    ctx.send(sanitizeUser(user));
  },

  async deleteUser(ctx) {
    const allowed = await requireAuthAdmin(ctx, strapi);
    if (!allowed) return;

    const id = Number(ctx.params.id);
    if (!id) return ctx.badRequest('Invalid user id.');

    const userService = strapi.plugin('users-permissions').service('user');
    await userService.remove({ id });

    ctx.send({ ok: true });
  },

  async listRoles(ctx) {
    const allowed = await requireAuthAdmin(ctx, strapi);
    if (!allowed) return;

    const roles = await strapi.query('plugin::users-permissions.role').findMany({
      select: ['id', 'name', 'type', 'description'],
      orderBy: { id: 'asc' },
    });

    ctx.send({ roles: roles || [] });
  },

  async listDomains(ctx) {
    const allowed = await requireAuthAdmin(ctx, strapi);
    if (!allowed) return;

    const domains = await listDomainsWithUserCounts(strapi);
    ctx.send({ data: domains });
  },

  async createDomain(ctx) {
    const allowed = await requireAuthAdmin(ctx, strapi);
    if (!allowed) return;

    const payload = ctx.request.body?.data || ctx.request.body || {};
    const key = String(payload.key || '').trim().toLowerCase();
    const name = String(payload.name || '').trim();

    if (!key || !name) {
      return ctx.badRequest('Key and name are required.');
    }

    const existing = await strapi.db.query('plugin::api-guard-pro.domain').findOne({
      where: { key },
      select: ['id'],
    });

    if (existing) {
      return ctx.badRequest('A domain with this key already exists.');
    }

    await strapi.db.query('plugin::api-guard-pro.domain').create({
      data: {
        key,
        name,
        description: payload.description || '',
        isActive: true,
        strapiRoleType: payload.strapiRoleType || 'authenticated',
        matchMode: 'header',
        matchKey: 'x-rutba-app',
      },
    });

    const domains = await listDomainsWithUserCounts(strapi);
    ctx.send({ data: domains });
  },

  async deleteDomain(ctx) {
    const allowed = await requireAuthAdmin(ctx, strapi);
    if (!allowed) return;

    const id = Number(ctx.params.id);
    if (!id) return ctx.badRequest('Invalid domain id.');

    const domain = await strapi.db.query('plugin::api-guard-pro.domain').findOne({
      where: { id },
      select: ['id', 'key'],
    });

    if (!domain) return ctx.notFound('Domain not found.');

    if (domain.key === 'web' || domain.key === 'web-user') {
      return ctx.badRequest('Core web domains cannot be deleted.');
    }

    await strapi.db.query('plugin::api-guard-pro.domain').update({
      where: { id },
      data: { isActive: false },
    });

    ctx.send({ ok: true });
  },
};
