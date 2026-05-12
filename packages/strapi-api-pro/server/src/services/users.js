'use strict';

const USER_UID = 'plugin::users-permissions.user';
const APP_ROLE_UID = 'plugin::api-pro.app-role';

async function listUsers(strapi) {
  return await strapi.db.query(USER_UID).findMany({
    orderBy: { id: 'asc' },
    select: ['id', 'username', 'email', 'displayName', 'blocked', 'confirmed'],
    populate: {
      role: { select: ['id', 'name', 'type'] },
      app_roles: {
        select: ['id', 'key', 'name', 'isActive', 'adminRoleCode'],
        populate: { appDomains: { select: ['id', 'key', 'name'] } },
      },
    },
  });
}

async function listAppRoleOptions(strapi) {
  return await strapi.db.query(APP_ROLE_UID).findMany({
    where: { isActive: true },
    orderBy: { key: 'asc' },
    select: ['id', 'key', 'name', 'adminRoleCode'],
    populate: {
      appDomains: { select: ['id', 'key', 'name'] },
    },
  });
}

async function assignUserAppRoles(strapi, userId, roleIds) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid user id');
    err.status = 400;
    throw err;
  }

  const validRoleIds = (Array.isArray(roleIds) ? roleIds : []).map(Number).filter((v) => Number.isFinite(v) && v > 0);

  const user = await strapi.db.query(USER_UID).findOne({ where: { id } });
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  await strapi.entityService.update(USER_UID, id, {
    data: {
      app_roles: { set: validRoleIds },
    },
  });

  return await strapi.db.query(USER_UID).findOne({
    where: { id },
    select: ['id', 'username', 'email', 'displayName'],
    populate: {
      app_roles: {
        select: ['id', 'key', 'name', 'isActive', 'adminRoleCode'],
        populate: { appDomains: { select: ['id', 'key', 'name'] } },
      },
    },
  });
}

module.exports = {
  listUsers,
  listAppRoleOptions,
  assignUserAppRoles,
};
