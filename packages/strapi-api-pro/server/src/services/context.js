'use strict';

// Claim resolution for api-pro.
//
// pos-strapi sends ONE header that affects authorization: `x-rutba-app`
// (the current application/domain the user is acting in). It optionally
// sends `x-rutba-app-admin: true` to request admin elevation when the user
// holds an admin role for that app. NO role-claim header is sent — the
// role is DERIVED from the user's assigned app_roles intersected with the
// current app context.
//
// This service produces a normalized claim object that downstream services
// (request-interceptor, me-permissions) consume.

const APP_ROLE_UID = 'plugin::api-pro.app-role';

function getHeader(ctx, key) {
  const raw = ctx?.request?.headers?.[String(key).toLowerCase()];
  return typeof raw === 'string' ? raw.trim() : '';
}

function readBoolHeader(ctx, key) {
  const v = ctx?.request?.headers?.[String(key).toLowerCase()];
  return v === true || v === 'true' || v === '1' || v === 1;
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

// Read header configuration each call so config overrides apply.
function readHeaderKeys(strapi) {
  const cfg = strapi.config.get('plugin::api-pro') || {};
  return {
    domain: (cfg.headerDomainKey || 'x-rutba-app').toLowerCase(),
    elevated: (cfg.headerElevatedKey || 'x-rutba-app-admin').toLowerCase(),
  };
}

// Load the user's app_roles with domains populated. Falls back to fetching
// from DB if `ctx.state.user.app_roles` isn't already hydrated (which it
// usually isn't — users-permissions returns a thin user object).
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

// Resolve the api-pro claim for the current request. Throws an error with
// .status when validation is strict and a required signal is missing; returns
// the claim object on success.
async function resolveClaim(ctx, strapi, { requireApp = true, requireActiveRole = true } = {}) {
  const user = ctx?.state?.user;
  if (!user?.id) {
    throw createValidationError('Authenticated user required', 'AUTH_REQUIRED', 401);
  }

  const headerKeys = readHeaderKeys(strapi);
  const appName = getHeader(ctx, headerKeys.domain);
  const elevated = readBoolHeader(ctx, headerKeys.elevated);

  if (requireApp && !appName) {
    throw createValidationError(
      `Missing app context header '${headerKeys.domain}'`,
      'APP_CONTEXT_REQUIRED',
      400
    );
  }

  const appRoles = await loadUserAppRoles(strapi, user.id);
  const activeRoles = filterRolesByApp(appRoles, appName);

  if (requireActiveRole && appName && activeRoles.length === 0) {
    throw createValidationError(
      `User has no app_role assigned for app '${appName}'`,
      'NO_ACTIVE_ROLE',
      403
    );
  }

  const activeRoleKeys = activeRoles.map((r) => normalizeKey(r)).filter(Boolean);
  const activeDomainKeys = Array.from(
    new Set(
      activeRoles
        .flatMap((r) => (Array.isArray(r.appDomains) ? r.appDomains : []))
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
    elevated,
    roleKeys: activeRoleKeys,
    domainKeys: activeDomainKeys,
    // Full role objects retained for /me/permissions response shaping.
    appRoles: activeRoles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name || r.key,
      adminRoleCode: r.adminRoleCode || null,
      appDomains: Array.isArray(r.appDomains)
        ? r.appDomains.map((d) => ({ id: d.id, key: d.key, name: d.name || d.key }))
        : [],
    })),
  };
}

module.exports = {
  resolveClaim,
  loadUserAppRoles,
  filterRolesByApp,
};
