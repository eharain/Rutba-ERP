'use strict';

/**
 * HR dashboard aggregates.
 *
 * Scope follows the same three tiers as the rest of the module: an org-wide HR
 * claim sees the whole company, a line manager sees only their reports, and a
 * plain employee gets their own personal summary. The scope is resolved ONCE
 * here and every metric is computed inside it, so a manager can never widen
 * their view by calling a different metric.
 */

const EMP_UID = 'api::hr-employee.hr-employee';
const LR_UID = 'api::hr-leave-request.hr-leave-request';
const CLAIM_UID = 'api::hr-expense-claim.hr-expense-claim';
const LOAN_UID = 'api::pay-loan.pay-loan';
const ADV_UID = 'api::pay-advance.pay-advance';
const ATT_UID = 'api::hr-attendance.hr-attendance';
const CI_UID = 'api::hr-compliance-item.hr-compliance-item';
const ENR_UID = 'api::hr-training-enrollment.hr-training-enrollment';
const APPRAISAL_UID = 'api::hr-appraisal.hr-appraisal';

const today = () => new Date().toISOString().slice(0, 10);

/** count() with an employee-scope filter folded in (null scope = org-wide). */
async function scopedCount(strapi, uid, filters, scopeDocIds, field = 'employee') {
  const f = { ...filters };
  if (scopeDocIds) {
    if (!scopeDocIds.length) return 0;
    f[field] = { documentId: { $in: scopeDocIds } };
  }
  return strapi.documents(uid).count({ filters: f });
}

/**
 * @param {object} strapi
 * @param {string[]|null} scopeDocIds employee documentIds in scope, or null for org-wide
 */
async function buildDashboard(strapi, scopeDocIds) {
  const day = today();
  const in60 = new Date();
  in60.setDate(in60.getDate() + 60);
  const cutoff = in60.toISOString().slice(0, 10);

  const [
    headcount,
    onLeaveToday,
    presentToday,
    pendingLeave,
    pendingClaims,
    pendingLoans,
    pendingAdvances,
    expiringCompliance,
    trainingInProgress,
    appraisalsOpen,
  ] = await Promise.all([
    scopeDocIds
      ? Promise.resolve(scopeDocIds.length)
      : strapi.documents(EMP_UID).count({ filters: { status: { $ne: 'Inactive' } } }),
    scopedCount(strapi, LR_UID, { status: { $eq: 'Approved' }, start_date: { $lte: day }, end_date: { $gte: day } }, scopeDocIds),
    scopedCount(strapi, ATT_UID, { date: { $eq: day } }, scopeDocIds),
    scopedCount(strapi, LR_UID, { status: { $eq: 'Pending' } }, scopeDocIds),
    scopedCount(strapi, CLAIM_UID, { status: { $eq: 'Submitted' } }, scopeDocIds),
    scopedCount(strapi, LOAN_UID, { status: { $eq: 'Requested' } }, scopeDocIds),
    scopedCount(strapi, ADV_UID, { status: { $eq: 'Requested' } }, scopeDocIds),
    scopedCount(strapi, CI_UID, { expiry_date: { $lte: cutoff, $notNull: true }, status: { $ne: 'Waived' } }, scopeDocIds),
    scopedCount(strapi, ENR_UID, { status: { $in: ['Enrolled', 'Attended'] } }, scopeDocIds),
    scopedCount(strapi, APPRAISAL_UID, { status: { $in: ['Draft', 'SelfAssessment', 'ManagerReview'] } }, scopeDocIds),
  ]);

  return {
    headcount,
    attendance: { present_today: presentToday, on_leave_today: onLeaveToday },
    pending_approvals: {
      leave: pendingLeave,
      expense_claims: pendingClaims,
      loans: pendingLoans,
      advances: pendingAdvances,
      total: pendingLeave + pendingClaims + pendingLoans + pendingAdvances,
    },
    compliance: { expiring_60d: expiringCompliance },
    learning: { in_progress: trainingInProgress },
    performance: { appraisals_open: appraisalsOpen },
    generated_at: new Date().toISOString(),
  };
}

/** Headcount split by department — org-wide/manager scope only, never per-employee. */
async function headcountByDepartment(strapi, scopeDocIds) {
  const filters = { status: { $ne: 'Inactive' } };
  if (scopeDocIds) {
    if (!scopeDocIds.length) return [];
    filters.documentId = { $in: scopeDocIds };
  }
  const rows = await strapi.documents(EMP_UID).findMany({
    filters,
    fields: ['documentId'],
    populate: { department: { fields: ['name'] } },
    pagination: { pageSize: 2000 },
  });
  const counts = new Map();
  for (const r of rows || []) {
    const key = r.department?.name || 'Unassigned';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts, ([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count);
}

module.exports = { buildDashboard, headcountByDepartment };
