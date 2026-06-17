'use strict';

/**
 * Resolve the set of app-role LEVELS a user holds, for workflow transition
 * `approles` enforcement (see workflow-engine.transitionAllowsRoles).
 *
 * app_roles carry keys like "manufacturing_manager" / "order_admin"; the level
 * is the suffix after the last underscore ("manager", "admin", "staff", …).
 * A Strapi super-admin (role.type === 'admin') carries the "*" wildcard so it
 * satisfies any restriction.
 *
 * @returns {Promise<Set<string>>}
 */
async function roleLevelsFor(userId, strapi) {
  const levels = new Set();
  if (!userId) return levels;
  try {
    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id: userId },
      populate: { role: { select: ['type'] }, app_roles: { select: ['key'] } },
    });
    if (user?.role?.type === 'admin') {
      ['admin', 'manager', 'staff'].forEach((l) => levels.add(l));
      levels.add('*');
    }
    for (const r of user?.app_roles || []) {
      const key = r?.key;
      if (!key) continue;
      const level = String(key).split('_').pop().toLowerCase();
      if (level) levels.add(level);
    }
  } catch (err) {
    try { strapi.log.warn(`[app-roles] roleLevelsFor(${userId}) failed: ${err.message}`); } catch (_) { /* no-op */ }
  }
  return levels;
}

module.exports = { roleLevelsFor };
