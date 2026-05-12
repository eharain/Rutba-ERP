'use strict';

const APP_ROLE_UID = 'plugin::api-pro.app-role';

function getHeader(ctx, key) {
  const value = ctx?.request?.headers?.[key.toLowerCase()];
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeClaims(ctx) {
  const appName = getHeader(ctx, 'x-rutba-app') || getHeader(ctx, 'x-app-name');
  const roleKey = getHeader(ctx, 'x-rutba-app-role') || getHeader(ctx, 'x-app-role');
  const domainKey = getHeader(ctx, 'x-rutba-app-domain') || getHeader(ctx, 'x-app-domain');

  return {
    appName,
    roleKey,
    domainKey,
  };
}

function normalizeUserRoleKeys(user) {
  const raw = user?.api_guard_roles;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (typeof entry === 'string') return entry.toLowerCase();
      if (entry && typeof entry.key === 'string') return entry.key.toLowerCase();
      return null;
    })
    .filter(Boolean);
}

function createValidationError(message, code = 'INVALID_CONTEXT_CLAIM', status = 403) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function validateClaimContext(ctx, strapi) {
  const claims = normalizeClaims(ctx);
  const user = ctx?.state?.user;

  if (!user?.id) {
    throw createValidationError('Authenticated user is required for app context validation', 'AUTH_REQUIRED', 401);
  }

  if (!claims.appName) {
    throw createValidationError('Missing appName claim header (x-rutba-app)', 'APP_CLAIM_REQUIRED', 400);
  }

  if (!claims.roleKey) {
    throw createValidationError('Missing role claim header (x-rutba-app-role)', 'ROLE_CLAIM_REQUIRED', 400);
  }

  const claimedRoleKey = claims.roleKey.toLowerCase();
  const userRoleKeys = normalizeUserRoleKeys(user);

  if (!userRoleKeys.includes(claimedRoleKey)) {
    throw createValidationError(`Claimed role '${claims.roleKey}' is not assigned to current user`, 'ROLE_NOT_ASSIGNED', 403);
  }

  const matchedRole = await strapi.db.query(APP_ROLE_UID).findOne({
    where: {
      key: claimedRoleKey,
      isActive: true,
    },
    populate: {
      appDomains: true,
    },
  });

  if (!matchedRole) {
    throw createValidationError(`Claimed app role '${claims.roleKey}' is not configured`, 'ROLE_NOT_CONFIGURED', 403);
  }

  const domainKeys = Array.isArray(matchedRole.appDomains)
    ? matchedRole.appDomains.map((d) => String(d?.key || '').toLowerCase()).filter(Boolean)
    : [];

  if (claims.domainKey) {
    const dk = claims.domainKey.toLowerCase();
    if (domainKeys.length > 0 && !domainKeys.includes(dk)) {
      throw createValidationError(`Claimed domain '${claims.domainKey}' is not allowed for role '${claims.roleKey}'`, 'DOMAIN_NOT_ALLOWED', 403);
    }
  }

  return {
    claim: {
      appName: claims.appName,
      roleKey: claimedRoleKey,
      domainKey: claims.domainKey || null,
    },
    user: {
      id: user.id,
      email: user.email || null,
      username: user.username || null,
    },
    role: {
      key: matchedRole.key,
      name: matchedRole.name || matchedRole.key,
      adminRoleCode: matchedRole.adminRoleCode,
      domainKeys,
    },
    audit: {
      validationSource: 'x-rutba-app/x-rutba-app-role headers',
      validatedAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  normalizeClaims,
  validateClaimContext,
};
