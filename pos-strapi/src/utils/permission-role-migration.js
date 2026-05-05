'use strict';

const APP_ACCESS_ALIASES = {
  rider: ['delivery'],
  'order-management': ['delivery', 'cms'],
  'web-orders': ['web-user'],
  web: ['web-user'],
};

function normalizeKeys(values = []) {
  return [...new Set(values.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean))];
}

function expandWithAliases(keys = []) {
  const expanded = new Set();

  for (const key of keys) {
    expanded.add(key);
    const aliases = APP_ACCESS_ALIASES[key] || [];
    aliases.forEach((alias) => expanded.add(alias));
  }

  return [...expanded];
}

function buildRoleKeys({ appKeys = [], adminKeys = [] }) {
  const normalizedApps = normalizeKeys(appKeys);
  const normalizedAdmins = normalizeKeys(adminKeys);

  const effectiveApps = expandWithAliases(normalizedApps);
  const effectiveAdmins = expandWithAliases(normalizedAdmins);

  const roleKeys = new Set();

  for (const appKey of effectiveApps) {
    if (effectiveAdmins.includes(appKey)) {
      roleKeys.add(`${appKey}-admin`);
      continue;
    }

    roleKeys.add(`${appKey}-staff`);
  }

  return [...roleKeys];
}

async function findPermissionRoleIds(strapi, roleKeys = []) {
  if (!Array.isArray(roleKeys) || roleKeys.length === 0) {
    return [];
  }

  const roles = await strapi.db.query('plugin::api-guard-pro.role').findMany({
    where: { key: { $in: roleKeys } },
    select: ['id', 'key'],
  });

  return (roles || []).map((role) => role.id);
}

async function mapLegacyAccessToPermissionRoles(strapi, { appKeys = [], adminKeys = [] } = {}) {
  const roleKeys = buildRoleKeys({ appKeys, adminKeys });
  const roleIds = await findPermissionRoleIds(strapi, roleKeys);

  return {
    roleKeys,
    roleIds,
  };
}

module.exports = {
  APP_ACCESS_ALIASES,
  buildRoleKeys,
  findPermissionRoleIds,
  mapLegacyAccessToPermissionRoles,
};
