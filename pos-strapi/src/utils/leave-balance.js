'use strict';

/**
 * Leave balance = opening_balance (brought forward, HR-set) + accrued_days
 * (computed live from the matching hr-leave-policy) - used_days (computed
 * live from Approved hr-leave-request rows) - encashed_days (HR-set).
 *
 * Only `opening_balance`/`encashed_days` are stored (per employee/leave_type/
 * year, on hr-leave-balance) — accrual and usage are always derived, so
 * there's no snapshot to keep in sync as requests get approved/cancelled.
 */

const LR_UID = 'api::hr-leave-request.hr-leave-request';
const POLICY_UID = 'api::hr-leave-policy.hr-leave-policy';
const BALANCE_UID = 'api::hr-leave-balance.hr-leave-balance';
const EMP_UID = 'api::hr-employee.hr-employee';

const LEAVE_TYPES = ['Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Unpaid', 'Other'];

/** Days accrued for `year`, prorated from date_of_joining if hired mid-year. */
function computeAccruedDays(policy, employee, year) {
  if (!policy || policy.accrual_method === 'None') return 0;

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const joinDate = employee?.date_of_joining ? new Date(employee.date_of_joining) : null;
  const effectiveStart = joinDate && joinDate > yearStart ? joinDate : yearStart;
  if (effectiveStart.getUTCFullYear() > year) return 0; // joins in a future year

  const startMonth = effectiveStart.getUTCFullYear() === year ? effectiveStart.getUTCMonth() : 0;

  if (policy.accrual_method === 'Yearly') {
    const monthsAvailable = 12 - startMonth;
    return Number(policy.annual_quota_days || 0) * (monthsAvailable / 12);
  }

  // Monthly: rate × completed months from effectiveStart through now (or year-end if past).
  const now = new Date();
  const asOf = now.getUTCFullYear() > year ? new Date(Date.UTC(year, 11, 31)) : now;
  const elapsedMonth = asOf.getUTCFullYear() === year ? asOf.getUTCMonth() : 11;
  const months = Math.max(0, elapsedMonth - startMonth + 1);
  return Number(policy.accrual_rate_per_period || 0) * months;
}

async function computeUsedDays(strapi, employeeDocId, leaveType, year) {
  const rows = await strapi.documents(LR_UID).findMany({
    filters: {
      employee: { documentId: { $eq: employeeDocId } },
      leave_type: { $eq: leaveType },
      status: { $eq: 'Approved' },
      start_date: { $gte: `${year}-01-01` },
      end_date: { $lte: `${year}-12-31` },
    },
    fields: ['total_days'],
    pagination: { pageSize: 500 },
  });
  return (rows || []).reduce((sum, r) => sum + Number(r.total_days || 0), 0);
}

async function computeLeaveBalance(strapi, employeeDocId, leaveType, year) {
  const [employee, policies, balances] = await Promise.all([
    strapi.documents(EMP_UID).findOne({ documentId: employeeDocId, fields: ['date_of_joining'] }),
    strapi.documents(POLICY_UID).findMany({
      filters: { leave_type: { $eq: leaveType }, is_active: { $eq: true } },
      pagination: { pageSize: 1 },
    }),
    strapi.documents(BALANCE_UID).findMany({
      filters: {
        employee: { documentId: { $eq: employeeDocId } },
        leave_type: { $eq: leaveType },
        year: { $eq: year },
      },
      pagination: { pageSize: 1 },
    }),
  ]);

  const policy = policies?.[0] || null;
  const openingBalance = Number(balances?.[0]?.opening_balance || 0);
  const encashedDays = Number(balances?.[0]?.encashed_days || 0);
  const accruedDays = computeAccruedDays(policy, employee || {}, year);
  const usedDays = await computeUsedDays(strapi, employeeDocId, leaveType, year);
  const remaining = openingBalance + accruedDays - usedDays - encashedDays;

  return {
    leave_type: leaveType,
    year,
    opening_balance: openingBalance,
    accrued_days: Math.round(accruedDays * 100) / 100,
    used_days: usedDays,
    encashed_days: encashedDays,
    remaining_days: Math.round(remaining * 100) / 100,
    policy: policy ? {
      annual_quota_days: policy.annual_quota_days,
      accrual_method: policy.accrual_method,
      carry_forward_allowed: policy.carry_forward_allowed,
      encashment_allowed: policy.encashment_allowed,
    } : null,
  };
}

async function computeAllLeaveBalances(strapi, employeeDocId, year) {
  const out = [];
  for (const type of LEAVE_TYPES) {
    out.push(await computeLeaveBalance(strapi, employeeDocId, type, year));
  }
  return out;
}

module.exports = { computeLeaveBalance, computeAllLeaveBalances, LEAVE_TYPES };
