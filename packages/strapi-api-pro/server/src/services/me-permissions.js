'use strict';

// Builds the /me/permissions response payload consumed by
// packages/pos-shared/context/AuthContext.js across every ERP frontend app.
//
// Response shape (load-bearing â€” see memory: project_pos_strapi_contracts):
//   {
//     role:        string,                                       // Strapi users-permissions role name
//     roleType:    string,                                       // Strapi users-permissions role type
//     domains:     [{ key, name, roleKey }, ...],                // one entry per (domain Ã— user role)
//     appRoles:    [{ id, key, name }, ...],                     // every app_role the user holds
//     permissions: { [contentTypeUid]: { [action]: {            // every method-policy the user can hit
//                     allowed: true,
//                     policies: [<policy row, minus internal cols>]
//                   } } },
//     strapiPermissions: [...],                                  // pass-through of role.permissions
//     sessionTimeout:    number,                                 // config.sessionTimeout (seconds)
//   }

const POLICY_UID = 'plugin::api-pro.api-method-policy';
const USER_UID = 'plugin::users-permissions.user';

function normalizeKey(value) {
  if (typeof value === 'string') return value.toLowerCase();
  if (value && typeof value === 'object' && typeof value.key === 'string') {
    return value.key.toLowerCase();
  }
  return null;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// Slim a stored policy row down to the fields the frontend actually reads.
function shapePolicyForResponse(policy) {
  return {
    id: policy.id,
    key: policy.key,
    name: policy.name || policy.key,
    roleKey: policy.roleKey,
    resolverMode: policy.resolverMode || 'strict',
    filtersTemplate: policy.filtersTemplate || {},
    populateTemplate: policy.populateTemplate || {},
    bodyTemplate: policy.bodyTemplate || {},
    queryTemplate: policy.queryTemplate || {},
  };
}

async function loadUser(strapi, userId) {
  return strapi.db.query(USER_UID).findOne({
    where: { id: userId },
    populate: {
      role: true,
      app_roles: { populate: { appDomains: true } },
    },
  });
}

async function loadPoliciesForRoles(strapi, roleKeys) {
  if (roleKeys.length === 0) return [];
  return strapi.db.query(POLICY_UID).findMany({
    where: { roleKey: { $in: roleKeys } },
    populate: { interfaceMethod: { populate: { apiInterface: true } } },
  });
}

// Allow consumers (e.g. pos-strapi) to inject additional role keys derived
// from external context â€” HR team membership, dynamic group assignments, etc.
// pos-strapi registers a provider in its bootstrap to add hr_* team roles.
async function gatherExtraRoleKeys(strapi, user) {
  const providers = strapi.apiPro?.roleProviders || [];
  const extras = [];
  for (const provide of providers) {
    try {
      const result = await provide(user, { strapi });
      if (Array.isArray(result)) {
        for (const k of result) {
          const normalized = normalizeKey(k);
          if (normalized) extras.push(normalized);
        }
      }
    } catch (error) {
      strapi.log.warn(`[api-pro] role provider failed: ${error?.message}`);
    }
  }
  return extras;
}

async function build(strapi, userId) {
  const cfg = strapi.config.get('plugin::api-pro') || {};
  const sessionTimeout = Number.isFinite(cfg.sessionTimeout) ? cfg.sessionTimeout : 3600;

  const user = await loadUser(strapi, userId);
  if (!user) {
    return {
      role: null,
      roleType: null,
      domains: [],
      appRoles: [],
      permissions: {},
      strapiPermissions: [],
      sessionTimeout,
    };
  }

  const appRoles = Array.isArray(user.app_roles) ? user.app_roles : [];

  const directRoleKeys = appRoles.map((r) => normalizeKey(r)).filter(Boolean);
  const extraRoleKeys = await gatherExtraRoleKeys(strapi, user);
  const allRoleKeys = Array.from(new Set([...directRoleKeys, ...extraRoleKeys]));

  // Build domains: one entry per (domain Ã— role) pair.
  const domainEntries = [];
  for (const role of appRoles) {
    const roleKey = normalizeKey(role);
    const domains = Array.isArray(role.appDomains) ? role.appDomains : [];
    for (const d of domains) {
      const domainKey = normalizeKey(d);
      if (!domainKey) continue;
      domainEntries.push({
        key: domainKey,
        name: d.name || domainKey,
        roleKey,
      });
    }
  }
  const domains = uniqueBy(domainEntries, (e) => `${e.key}|${e.roleKey}`);

  // Build permissions: nested by contentTypeUid â†’ action.
  const policies = await loadPoliciesForRoles(strapi, allRoleKeys);
  const permissions = {};
  for (const policy of policies) {
    const ctUid = policy.interfaceMethod?.apiInterface?.uid;
    const action = policy.interfaceMethod?.action;
    if (!ctUid || !action) continue;

    permissions[ctUid] = permissions[ctUid] || {};
    permissions[ctUid][action] = permissions[ctUid][action] || { allowed: true, policies: [] };
    permissions[ctUid][action].policies.push(shapePolicyForResponse(policy));
  }

  // Strapi users-permissions role passthrough.
  const strapiRole = user.role || null;
  const strapiPermissions = Array.isArray(strapiRole?.permissions) ? strapiRole.permissions : [];

  // Group the user's app_roles by app/domain so the client can render a
  // role-selector menu per app. Each entry: app domain key â†’ array of roles
  // the user can choose from when acting in that app.
  const rolesByApp = {};
  for (const role of appRoles) {
    const roleKey = normalizeKey(role);
    if (!roleKey) continue;
    const domains = Array.isArray(role.appDomains) ? role.appDomains : [];
    if (domains.length === 0) {
      // Role with no domain restriction â€” present under a wildcard key so
      // clients can recognise it.
      rolesByApp['*'] = rolesByApp['*'] || [];
      rolesByApp['*'].push({ key: roleKey, name: role.name || roleKey });
      continue;
    }
    for (const d of domains) {
      const domainKey = normalizeKey(d);
      if (!domainKey) continue;
      rolesByApp[domainKey] = rolesByApp[domainKey] || [];
      rolesByApp[domainKey].push({ key: roleKey, name: role.name || roleKey });
    }
  }

  return {
    role: strapiRole?.name || null,
    roleType: strapiRole?.type || null,
    domains,
    appRoles: appRoles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name || r.key,
    })),
    rolesByApp,
    permissions,
    strapiPermissions,
    sessionTimeout,
  };
}

module.exports = {
  build,
  gatherExtraRoleKeys,
};
