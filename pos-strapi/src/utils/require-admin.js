'use strict';

const { ensureUser } = require('./ensure-user');

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
  const user = await ensureUser(ctx, strapi);
  if (!user) return null;

  let full = null;
  try {
    full = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      populate: { role: { select: ['type'] }, app_roles: { select: ['key'] } },
    });
  } catch (e) {
    strapi.log.warn(`[require-admin] role lookup failed for user ${user.id}: ${e.message}`);
  }

  const isSuperAdmin = full?.role?.type === 'admin';
  const dom = String(domain || '').trim().toLowerCase();
  const hasDomainAdmin = (full?.app_roles || []).some((r) => {
    const k = String(r?.key || '').trim().toLowerCase();
    return k === `${dom}_admin` || (k.startsWith(`${dom}_`) && k.endsWith('_admin'));
  });

  if (!isSuperAdmin && !hasDomainAdmin) {
    ctx.forbidden(`Admin role required for ${dom}`);
    return null;
  }
  return user;
}

/**
 * DB-backed membership gate: the caller must be a Strapi super-admin OR hold ANY
 * app-role in `domain` (e.g. social_admin / social_manager / social_staff).
 * Use on brand-acting operations (publish, reply, sync) so social staff can
 * operate, while still blocking unrelated users (e.g. storefront customers).
 */
async function requireAppMember(ctx, strapi, domain) {
  const user = await ensureUser(ctx, strapi);
  if (!user) return null;

  let full = null;
  try {
    full = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id: user.id },
      populate: { role: { select: ['type'] }, app_roles: { select: ['key'] } },
    });
  } catch (e) {
    strapi.log.warn(`[require-admin] role lookup failed for user ${user.id}: ${e.message}`);
  }

  const isSuperAdmin = full?.role?.type === 'admin';
  const dom = String(domain || '').trim().toLowerCase();
  const hasDomainRole = (full?.app_roles || []).some((r) => {
    const k = String(r?.key || '').trim().toLowerCase();
    return k === dom || k.startsWith(`${dom}_`);
  });

  if (!isSuperAdmin && !hasDomainRole) {
    ctx.forbidden(`A ${dom} app role is required`);
    return null;
  }
  return user;
}

module.exports = { requireAppAdmin, requireAppMember };
