'use strict';

const { ensureUser } = require('./ensure-user');

// Shared DB-backed lookup: the caller's users-permissions role type + app-role
// keys. Never trusts client headers (X-Rutba-App-Role is claim selection, not
// proof of membership).
async function loadRoleKeys(strapi, userId) {
  let full = null;
  try {
    full = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id: userId },
      populate: { role: { select: ['type'] }, app_roles: { select: ['key'] } },
    });
  } catch (e) {
    strapi.log.warn(`[require-admin] role lookup failed for user ${userId}: ${e.message}`);
  }
  return {
    isSuperAdmin: full?.role?.type === 'admin',
    keys: (full?.app_roles || [])
      .map((r) => String(r?.key || '').trim().toLowerCase())
      .filter(Boolean),
  };
}

/**
 * DB-backed admin gate for a given app domain.
 *
 * The caller must be a Strapi super-admin OR hold an app-role `${domain}_admin`
 * (e.g. `social_admin`). Crucially this reads the user's ACTUAL app_roles from
 * the database rather than trusting the client-supplied `X-Rutba-App-Role`
 * header — so credential/settings endpoints can't be reached by forging a
 * header. Use on routes that manage secrets or act on the brand's behalf.
 *
 * Returns the user, or null after sending 401/403.
 */
async function requireAppAdmin(ctx, strapi, domain) {
  return requireAppRole(ctx, strapi, {
    domains: [domain],
    levels: ['admin'],
    message: `Admin role required for ${String(domain || '').trim().toLowerCase()}`,
  });
}

/**
 * DB-backed membership gate: the caller must be a Strapi super-admin OR hold ANY
 * app-role in `domain` (e.g. social_admin / social_manager / social_staff).
 * Use on brand-acting operations (publish, reply, sync) so social staff can
 * operate, while still blocking unrelated users (e.g. storefront customers).
 */
async function requireAppMember(ctx, strapi, domain) {
  return requireAppRole(ctx, strapi, {
    domains: [domain],
    message: `A ${String(domain || '').trim().toLowerCase()} app role is required`,
  });
}

/**
 * Generalised DB-backed role gate for auth:false custom routes.
 *
 * The caller must be a Strapi super-admin OR hold an app-role whose key is
 * `<domain>` or `<domain>_<level>` for one of `domains`. When `levels` is
 * given, only those levels pass (e.g. ['admin','manager'] blocks staff);
 * when omitted, any member of the domain passes.
 *
 * Returns the user, or null after sending 401/403 — callers just
 * `if (!user) return;`.
 */
async function requireAppRole(ctx, strapi, { domains = [], levels = null, message } = {}) {
  const user = await ensureUser(ctx, strapi);
  if (!user) return null;

  const { isSuperAdmin, keys } = await loadRoleKeys(strapi, user.id);
  if (isSuperAdmin) return user;

  const doms = domains.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean);
  const lvls = Array.isArray(levels) && levels.length
    ? levels.map((l) => String(l || '').trim().toLowerCase()).filter(Boolean)
    : null;

  const ok = keys.some((k) => doms.some((dom) => {
    if (k !== dom && !k.startsWith(`${dom}_`)) return false;
    if (!lvls) return true;
    return lvls.some((lvl) => k === `${dom}_${lvl}` || k.endsWith(`_${lvl}`));
  }));

  if (!ok) {
    const want = lvls ? `${doms.join('/')} ${lvls.join('/')}` : doms.join('/');
    ctx.forbidden(message || `A ${want} app role is required`);
    return null;
  }
  return user;
}

module.exports = { requireAppAdmin, requireAppMember, requireAppRole };
