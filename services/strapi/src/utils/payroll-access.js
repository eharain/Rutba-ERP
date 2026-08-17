'use strict';

/**
 * Shared payroll authorization helpers — mirrors hr-access.js's isHrManager
 * pattern, scoped to the payroll domain's own claim keys. Used by every
 * payroll content-type with a manager/admin org-wide bypass (payslips, loans,
 * advances, bonuses): payroll admin/manager acts org-wide; a line manager
 * (via hr-access.js#managedReportDocIds) is scoped to their reports; anyone
 * else sees only their own.
 */

const PAYROLL_MANAGER_ROLE_KEYS = new Set(['payroll_admin', 'payroll_manager']);
const PAYROLL_ADMIN_ROLE_KEYS = new Set(['payroll_admin']);

async function loadActor(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: { role: { select: ['type'] } },
  });
}

/** Org-wide payroll authority for the CURRENT request (payroll_admin or payroll_manager claim, or Strapi super-admin). */
function isPayrollManager(ctx, user) {
  if (user?.role?.type === 'admin') return true;
  const roleKey = ctx?.state?.apiProClaim?.roleKey;
  return roleKey ? PAYROLL_MANAGER_ROLE_KEYS.has(roleKey) : false;
}

/** Org-wide payroll ADMIN authority only (payroll_admin claim, or Strapi super-admin) — for financial write actions like marking paid. */
function isPayrollAdmin(ctx, user) {
  if (user?.role?.type === 'admin') return true;
  const roleKey = ctx?.state?.apiProClaim?.roleKey;
  return roleKey ? PAYROLL_ADMIN_ROLE_KEYS.has(roleKey) : false;
}

module.exports = { loadActor, isPayrollManager, isPayrollAdmin };
