'use strict';

const { ensureUser } = require('../../../utils/ensure-user');

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
      admin_app_accesses: { select: ['key'] },
    },
  });

  const isAuthAdmin = (fullUser?.admin_app_accesses || []).some((a) => a.key === AUTH_APP_KEY);
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
      app_accesses: true,
      admin_app_accesses: true,
    },
  });
}

module.exports = {
  async listUsers(ctx) {
    const allowed = await requireAuthAdmin(ctx, strapi);
    if (!allowed) return;

    const users = await strapi.query('plugin::users-permissions.user').findMany({
      populate: {
        role: true,
        app_accesses: true,
        admin_app_accesses: true,
      },
      orderBy: { id: 'desc' },
    });

    ctx.send((users || []).map(sanitizeUser));
  },

  async getUser(ctx) {
    const allowed = await requireAuthAdmin(ctx, strapi);
    if (!allowed) return;

    const id = Number(ctx.params.id);
    if (!id) return ctx.badRequest('Invalid user id.');

    const user = await fetchUserById(strapi, id);
    if (!user) return ctx.notFound('User not found.');

    ctx.send(sanitizeUser(user));
  },

  async createUser(ctx) {
    const allowed = await requireAuthAdmin(ctx, strapi);
    if (!allowed) return;

    const payload = ctx.request.body || {};
    const userService = strapi.plugin('users-permissions').service('user');

    const created = await userService.add({
      username: payload.username,
      email: payload.email,
      password: payload.password,
      provider: 'local',
      displayName: payload.displayName,
      confirmed: payload.confirmed,
      blocked: payload.blocked,
      role: payload.role,
      app_accesses: payload.app_accesses || [],
      admin_app_accesses: payload.admin_app_accesses || [],
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

    const nextData = {
      username: payload.username,
      email: payload.email,
      provider: payload.provider || 'local',
      displayName: payload.displayName,
      confirmed: payload.confirmed,
      blocked: payload.blocked,
      role: payload.role,
      app_accesses: payload.app_accesses,
      admin_app_accesses: payload.admin_app_accesses,
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
};
