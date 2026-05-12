// @ts-nocheck
'use strict';

const { ensureUser } = require('../../../utils/ensure-user');
const { resolveGuardRoles } = require('../../../utils/guard-roles');

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
  const roles = user?.app_roles || [];

  const appKeys = [...new Set(
    roles
      .flatMap((role) => (role?.appDomains || []).map((d) => d?.key))
      .filter(Boolean)
  )];

  // AGP roles have no level field; admin roles are identified by key convention (*_admin or *-admin)
  const adminKeys = [...new Set(
    roles
      .filter((role) => /admin/i.test(role?.key || ''))
      .flatMap((role) => (role?.appDomains || []).map((d) => d?.key))
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

  const domains = await strapi.db.query('plugin::api-pro.app-domain').findMany({
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
      app_roles: {
        select: ['key'],
        populate: {
          appDomains: { select: ['key'] },
        },
      },
    },
  });

  // Admin = has an AGP role whose key matches the admin convention (*_admin/*-admin)
  // and whose domain is the auth app
  const isAuthAdmin = (fullUser?.app_roles || []).some((role) =>
    /admin/i.test(role?.key || '') && (role?.appDomains || []).some((d) => d?.key === AUTH_APP_KEY)
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
      app_roles: {
        populate: {
          appDomains: true,
        },
      },
    },
  });
}

async function listDomainsWithUserCounts(strapi) {
  const domains = await strapi.db.query('plugin::api-pro.app-domain').findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: ['id', 'documentId', 'key', 'name', 'description'],
  });

  const users = await strapi.query('plugin::users-permissions.user').findMany({
    populate: {
      app_roles: {
        populate: {
          appDomains: {
            select: ['key'],
          },
        },
      },
    },
  });

  const usersByDomainKey = new Map();
  for (const user of users || []) {
    const domainKeys = new Set(
      (user.app_roles || [])
        .flatMap((role) => (role?.appDomains || []).map((d) => d?.key))
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
        app_roles: {
          populate: {
            appDomains: true,
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

    const { roleIds } = await resolveGuardRoles(strapi, {
      domainKeys: appAccesses,
      adminKeys: adminAppAccesses,
      roleKeys: payload.role_keys || [],
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
      app_roles: roleIds,
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

    const { roleIds } = await resolveGuardRoles(strapi, {
      domainKeys: appAccesses,
      adminKeys: adminAppAccesses,
      roleKeys: payload.role_keys || [],
    });

    const nextData = {
      username: payload.username,
      email: payload.email,
      provider: payload.provider || 'local',
      displayName: payload.displayName,
      confirmed: payload.confirmed,
      blocked: payload.blocked,
      role: payload.role,
      app_roles: roleIds,
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

    const existing = await strapi.db.query('plugin::api-pro.app-domain').findOne({
      where: { key },
      select: ['id'],
    });

    if (existing) {
      return ctx.badRequest('A domain with this key already exists.');
    }

    await strapi.db.query('plugin::api-pro.app-domain').create({
      data: {
        key,
        name,
        description: payload.description || '',
        isActive: true,
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

    const domain = await strapi.db.query('plugin::api-pro.app-domain').findOne({
      where: { id },
      select: ['id', 'key'],
    });

    if (!domain) return ctx.notFound('Domain not found.');

    if (domain.key === 'web' || domain.key === 'web-user') {
      return ctx.badRequest('Core web domains cannot be deleted.');
    }

    await strapi.db.query('plugin::api-pro.app-domain').update({
      where: { id },
      data: { isActive: false },
    });

    ctx.send({ ok: true });
  },
};
