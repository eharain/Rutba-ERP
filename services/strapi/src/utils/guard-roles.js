// @ts-nocheck
'use strict';

/**
 * guard-roles.js
 *
 * Utility for resolving api-pro app role IDs from domain keys.
 *
 * App roles are stored as flat keys (e.g. `pos_admin`, `stock_staff`) and
 * linked to app domains.
 *
 * For direct role key assignment (e.g. from hr_teams.app_roles) use roleKeys.
 * For domain-scoped resolution use domainKeys.
 *
 * Pass adminKeys to separate the two access levels the auth app offers per
 * domain: a domain listed there grants every role including `*_admin`, a domain
 * listed only in domainKeys grants the rest (`*_manager`, `*_staff`). App-role
 * has no level column, so admin roles are recognised by key convention — the
 * same rule auth-admin's read path (deriveDomainAccessFromUser) uses to decide
 * whether to tick "Admin Access", which is what makes the toggle round-trip.
 */

const ROLE_UID = 'plugin::api-pro.app-role';

const isAdminRoleKey = (key) => /admin/i.test(String(key || ''));

const normalizeKeys = (values) =>
  (values || []).map((v) => String(v).trim().toLowerCase()).filter(Boolean);

/**
 * @param {object} strapi
 * @param {object} opts
 * @param {string[]} opts.domainKeys - domain keys to fetch roles for
 * @param {string[]} [opts.adminKeys] - subset of domains that also get `*_admin`.
 *   Omit entirely (not `[]`) to keep the legacy all-roles-per-domain behaviour.
 * @param {string[]} [opts.roleKeys] - direct guard role keys (bypasses domain resolution)
 * @returns {{ roleKeys: string[], roleIds: number[] }}
 */
async function resolveGuardRoles(strapi, { domainKeys = [], roleKeys = [], adminKeys } = {}) {
  const directKeys = normalizeKeys(roleKeys);
  // Admin access implies plain access, so an admin domain counts as granted
  // even if the caller left it out of domainKeys.
  const adminDomains = adminKeys === undefined ? null : new Set(normalizeKeys(adminKeys));
  const domains = [...new Set([...normalizeKeys(domainKeys), ...(adminDomains || [])])];

  let roles = [];

  const rolesForDomains = async (keys) => (keys.length === 0 ? [] : strapi.db.query(ROLE_UID).findMany({
    where: {
      isActive: true,
      appDomains: { key: { $in: keys } },
    },
    select: ['id', 'key'],
  }));

  if (domains.length > 0) {
    if (adminDomains === null) {
      roles = await rolesForDomains(domains);
    } else {
      // Two passes rather than one filtered pass: a role can be linked to more
      // than one domain, and reaching it through an admin domain has to win.
      const elevated = domains.filter((d) => adminDomains.has(d));
      const plain = domains.filter((d) => !adminDomains.has(d));
      roles = [
        ...await rolesForDomains(elevated),
        ...(await rolesForDomains(plain)).filter((r) => !isAdminRoleKey(r.key)),
      ];
    }
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

module.exports = { resolveGuardRoles, isAdminRoleKey };
