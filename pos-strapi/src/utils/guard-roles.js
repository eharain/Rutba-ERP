// @ts-nocheck
'use strict';

/**
 * guard-roles.js
 *
 * Utility for resolving api-pro app role IDs from domain keys.
 *
 * App roles are stored as flat keys (e.g. `sale_admin`, `stock_staff`) and
 * linked to app domains.
 *
 * For direct role key assignment (e.g. from hr_teams.app_roles) use roleKeys.
 * For domain-scoped resolution use domainKeys (returns all roles for those domains).
 */

const ROLE_UID = 'plugin::api-pro.app-role';

/**
 * @param {object} strapi
 * @param {object} opts
 * @param {string[]} opts.domainKeys - domain keys to fetch all roles for
 * @param {string[]} [opts.roleKeys] - direct guard role keys (bypasses domain resolution)
 * @returns {{ roleKeys: string[], roleIds: number[] }}
 */
async function resolveGuardRoles(strapi, { domainKeys = [], roleKeys = [] } = {}) {
  const directKeys = roleKeys.map((k) => String(k).trim().toLowerCase()).filter(Boolean);
  const domains = domainKeys.map((dk) => String(dk).trim().toLowerCase()).filter(Boolean);

  let roles = [];

  if (domains.length > 0) {
    roles = await strapi.db.query(ROLE_UID).findMany({
      where: {
        isActive: true,
        appDomains: { key: { $in: domains } },
      },
      select: ['id', 'key'],
    });
  }

  if (directKeys.length > 0) {
    const direct = await strapi.db.query(ROLE_UID).findMany({
      where: { key: { $in: directKeys }, isActive: true },
      select: ['id', 'key'],
    });
    roles = [...roles, ...direct];
  }

  const seen = new Set();
  const unique = roles.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  return {
    roleKeys: unique.map((r) => r.key),
    roleIds: unique.map((r) => r.id),
  };
}

module.exports = { resolveGuardRoles };
