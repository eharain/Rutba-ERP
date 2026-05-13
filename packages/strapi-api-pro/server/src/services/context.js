'use strict';

// Claim resolution for api-pro.
//
// pos-strapi sends TWO authorization-affecting headers:
//   x-rutba-app       â€” which app/domain the user is acting in
//   x-rutba-app-role  â€” which of the user's roles for that app is active
//                       (client renders a role-selector menu when the user
//                        holds more than one role for the app)
//
// The active role is CLAIMED via header â€” the server validates that:
//   1. The role exists in api_pro_app_roles
//   2. The user actually holds that role (via user.app_roles)
//   3. The role's appDomains includes the claimed app
//
// When the user holds exactly one role for the active app, the role header
// is optional â€” the single match is auto-selected.

const APP_ROLE_UID = 'plugin::api-pro.app-role';

function getHeader(ctx, key) {
  const raw = ctx?.request?.headers?.[String(key).toLowerCase()];
  return typeof raw === 'string' ? raw.trim() : '';
}

function normalizeKey(value) {
  if (typeof value === 'string') return value.toLowerCase();
  if (value && typeof value === 'object' && typeof value.key === 'string') {
    return value.key.toLowerCase();
  }
  return null;
}

function createValidationError(message, code, status = 403) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function readHeaderKeys(strapi) {
  const cfg = strapi.config.get('plugin::api-pro') || {};
  return {
    domain: (cfg.headerDomainKey || 'x-rutba-app').toLowerCase(),
    role: (cfg.headerRoleKey || 'x-rutba-app-role').toLowerCase(),
  };
}

// Load the user's app_roles with domains populated. Falls back to fetching
// from DB if `ctx.state.user.app_roles` isn't already hydrated (which it
// usually isn't â€” users-permissions returns a thin user object).
async function loadUserAppRoles(strapi, userId) {
  if (!userId) return [];
  try {
    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: userId },
      populate: { app_roles: { populate: { appDomains: true } }, role: true },
    });
    return Array.isArray(user?.app_roles) ? user.app_roles : [];
  } catch (error) {
    strapi.log.warn(`[api-pro] failed to load app_roles for user ${userId}: ${error?.message}`);
    return [];
  }
}

// Filter the user's app_roles down to those that include the current app
// in their appDomains. A role with no domains is treated as global.
function filterRolesByApp(appRoles, appName) {
  if (!appName) return appRoles;
  const wanted = appName.toLowerCase();
  return appRoles.filter((role) => {
    const domains = Array.isArray(role.appDomains) ? role.appDomains : [];
    if (domains.length === 0) return true;
    return domains.some((d) => normalizeKey(d) === wanted);
  });
}

// Pick the active role: explicit claim from header if valid, otherwise
// auto-select if the user has exactly one role for the active app.
function pickActiveRole(rolesForApp, claimedRoleKey) {
  if (claimedRoleKey) {
    const match = rolesForApp.find((r) => normalizeKey(r) === claimedRoleKey);
    if (!match) {
      throw createValidationError(
        `Claimed role '${claimedRoleKey}' is not assigned to the current user for this app`,
        'ROLE_NOT_ASSIGNED'
      );
    }
    return match;
  }

  if (rolesForApp.length === 1) {
    return rolesForApp[0]; // unambiguous â€” auto-select
  }

  if (rolesForApp.length > 1) {
    const choices = rolesForApp.map((r) => normalizeKey(r)).filter(Boolean).join(', ');
    throw createValidationError(
      `User holds multiple roles for this app â€” claim one via the role header (choices: ${choices})`,
      'ROLE_CLAIM_AMBIGUOUS',
      400
    );
  }

  throw createValidationError(
    'User has no app_role assigned for the active app',
    'NO_ACTIVE_ROLE'
  );
}

// Resolve the api-pro claim for the current request. Throws on missing/invalid
// signals with .status set so the middleware can respond properly.
async function resolveClaim(ctx, strapi, { requireApp = true, requireActiveRole = true } = {}) {
  const user = ctx?.state?.user;
  if (!user?.id) {
    throw createValidationError('Authenticated user required', 'AUTH_REQUIRED', 401);
  }

  const headerKeys = readHeaderKeys(strapi);
  const appName = getHeader(ctx, headerKeys.domain);
  const claimedRoleKey = getHeader(ctx, headerKeys.role).toLowerCase() || null;

  if (requireApp && !appName) {
    throw createValidationError(
      `Missing app context header '${headerKeys.domain}'`,
      'APP_CONTEXT_REQUIRED',
      400
    );
  }

  const appRoles = await loadUserAppRoles(strapi, user.id);
  const rolesForApp = filterRolesByApp(appRoles, appName);

  let activeRole = null;
  if (requireActiveRole && appName) {
    activeRole = pickActiveRole(rolesForApp, claimedRoleKey);
  } else if (claimedRoleKey && rolesForApp.length > 0) {
    // Best-effort match without throwing.
    activeRole = rolesForApp.find((r) => normalizeKey(r) === claimedRoleKey) || null;
  }

  const activeDomainKeys = Array.from(
    new Set(
      (activeRole?.appDomains || [])
        .map((d) => normalizeKey(d))
        .filter(Boolean)
    )
  );

  return {
    user: {
      id: user.id,
      email: user.email || null,
      username: user.username || null,
    },
    appName: appName || null,
    // The active claimed role â€” this is what request-interceptor uses to
    // pick which policies apply.
    roleKey: activeRole ? normalizeKey(activeRole) : null,
    domainKey: appName ? appName.toLowerCase() : null,
    domainKeys: activeDomainKeys,
    // Full active-role detail retained for /me/permissions shaping.
    activeRole: activeRole
      ? {
          id: activeRole.id,
          key: activeRole.key,
          name: activeRole.name || activeRole.key,
          adminRoleCode: activeRole.adminRoleCode || null,
          appDomains: Array.isArray(activeRole.appDomains)
            ? activeRole.appDomains.map((d) => ({ id: d.id, key: d.key, name: d.name || d.key }))
            : [],
        }
      : null,
    // All of the user's roles for the active app â€” surface so the
    // /me/permissions response and any client UI can render the role
    // selector menu.
    rolesForApp: rolesForApp.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name || r.key,
      adminRoleCode: r.adminRoleCode || null,
    })),
  };
}

module.exports = {
  resolveClaim,
  loadUserAppRoles,
  filterRolesByApp,
};
