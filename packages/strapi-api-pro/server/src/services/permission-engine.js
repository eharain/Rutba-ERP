'use strict';

// Permission engine: resolves which api_pro_method_policies apply to a
// (user Ã— content-type Ã— action) tuple, cache-backed via strapi.apiPro.cache.
//
// Lookup path:
//   ctx.state.route.handler  â†’ 'api::product.product.find'
//                            â†’ { contentTypeUid: 'api::product.product', actionName: 'find' }
//   user.app_roles[].key     â†’ role keys (with Strapi-role fallback)
//
// Stored policies join:
//   api_pro_method_policies.roleKey            IN userRoleKeys
//   api_pro_method_policies.interfaceMethod.action === actionName
//   api_pro_method_policies.interfaceMethod.apiInterface.uid === contentTypeUid
//
// The cache lives in strapi.apiPro.cache (created in bootstrap.js) and is
// invalidated by content-type lifecycle subscribers on app-role/app-domain/
// method-policy mutations.

const POLICY_UID = 'plugin::api-pro.api-method-policy';

function normalizeRoleKey(value) {
  if (typeof value === 'string') return value.toLowerCase();
  if (value && typeof value === 'object') {
    if (typeof value.key === 'string') return value.key.toLowerCase();
    if (typeof value.name === 'string') return value.name.toLowerCase();
  }
  return null;
}

// Extract role keys for a user. Strapi-role fallback matches AGP behavior:
// if the user has no app_roles but does have a users-permissions role, treat
// the Strapi role name as a single baseline role key so the lookup still hits.
function resolveUserRoleKeys(user) {
  if (!user) return [];

  const fromAppRoles = Array.isArray(user.app_roles)
    ? user.app_roles.map(normalizeRoleKey).filter(Boolean)
    : [];
  if (fromAppRoles.length > 0) return Array.from(new Set(fromAppRoles));

  const strapiRoleName =
    typeof user.role === 'string'
      ? user.role
      : (user.role && typeof user.role === 'object' ? user.role.name || user.role.type : null);
  const key = normalizeRoleKey(strapiRoleName);
  return key ? [key] : [];
}

// Parse Strapi's `ctx.state.route.handler` string into its content-type + action parts.
// 'api::product.product.find'        â†’ { contentTypeUid: 'api::product.product', actionName: 'find' }
// 'plugin::users-permissions.user.me' â†’ { contentTypeUid: 'plugin::users-permissions.user', actionName: 'me' }
function parseRouteHandler(handler) {
  if (typeof handler !== 'string' || !handler.includes('::')) return null;
  const lastDot = handler.lastIndexOf('.');
  if (lastDot < 0) return null;
  return {
    contentTypeUid: handler.slice(0, lastDot),
    actionName: handler.slice(lastDot + 1),
  };
}

function makeCacheKey(userId, contentTypeUid, actionName) {
  return `u:${userId}:p:${contentTypeUid}:${actionName}`;
}

// Look up all policies that apply to (user Ã— contentTypeUid Ã— actionName).
// Returns an array of policy rows including their template fields verbatim.
async function getPoliciesForAction(strapi, { user, contentTypeUid, actionName }) {
  const userId = user?.id;
  if (!userId || !contentTypeUid || !actionName) return [];

  const roleKeys = resolveUserRoleKeys(user);
  if (roleKeys.length === 0) return [];

  const cache = strapi.apiPro?.cache;
  const key = makeCacheKey(userId, contentTypeUid, actionName);
  if (cache) {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
  }

  let policies = [];
  try {
    policies = await strapi.db.query(POLICY_UID).findMany({
      where: {
        roleKey: { $in: roleKeys },
        interfaceMethod: {
          action: actionName,
          apiInterface: { uid: contentTypeUid },
        },
      },
      populate: { interfaceMethod: { populate: { apiInterface: true } } },
    });
  } catch (error) {
    // If nested-relation filtering breaks (Strapi version drift), fall back
    // to a two-step lookup so callers don't see a 500.
    strapi.log.warn(`[api-pro] nested policy lookup failed: ${error?.message}; falling back`);
    const methods = await strapi.db.query('plugin::api-pro.api-interface-method').findMany({
      where: { action: actionName, apiInterface: { uid: contentTypeUid } },
      select: ['id'],
    });
    const methodIds = methods.map((m) => m.id);
    if (methodIds.length === 0) {
      policies = [];
    } else {
      policies = await strapi.db.query(POLICY_UID).findMany({
        where: { roleKey: { $in: roleKeys }, interfaceMethod: { id: { $in: methodIds } } },
      });
    }
  }

  if (cache) cache.set(key, policies);
  return policies;
}

function clearCache(strapi, userId) {
  if (userId) strapi.apiPro?.cache?.clearUser?.(userId);
  else strapi.apiPro?.cache?.clearAll?.();
}

// Look up the single policy that applies to the (claimed role Ã— content-type
// Ã— action) tuple. Returns at most one row because the (interface Ã— method Ã—
// role) composite key is unique.
async function getPolicyForActionAndRole(strapi, { user, roleKey, contentTypeUid, actionName }) {
  const userId = user?.id;
  if (!userId || !roleKey || !contentTypeUid || !actionName) return null;
  const lower = String(roleKey).toLowerCase();

  const cache = strapi.apiPro?.cache;
  const key = `u:${userId}:r:${lower}:p:${contentTypeUid}:${actionName}`;
  if (cache) {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
  }

  let row = null;
  try {
    row = await strapi.db.query(POLICY_UID).findOne({
      where: {
        roleKey: lower,
        interfaceMethod: {
          action: actionName,
          apiInterface: { uid: contentTypeUid },
        },
      },
      populate: { interfaceMethod: { populate: { apiInterface: true } } },
    });
  } catch (error) {
    strapi.log.warn(`[api-pro] policy lookup failed: ${error?.message}; falling back`);
    const method = await strapi.db.query('plugin::api-pro.api-interface-method').findOne({
      where: { action: actionName, apiInterface: { uid: contentTypeUid } },
      select: ['id'],
    });
    if (method) {
      row = await strapi.db.query(POLICY_UID).findOne({
        where: { roleKey: lower, interfaceMethod: { id: method.id } },
      });
    }
  }

  if (cache) cache.set(key, row);
  return row;
}

module.exports = {
  resolveUserRoleKeys,
  parseRouteHandler,
  getPoliciesForAction,
  getPolicyForActionAndRole,
  clearCache,
};
