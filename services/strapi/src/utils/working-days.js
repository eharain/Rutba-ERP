'use strict';

/**
 * Working-day maths: the shared answer to "how many days does this date range
 * actually cost?", excluding weekends and the hr-holiday-calendar.
 *
 * Two callers must agree exactly or an employee is paid wrong:
 *   1. the hr-leave-request lifecycle, which stamps `total_days` (what the
 *      leave balance is deducted by), and
 *   2. the payroll engine, which re-counts the in-period slice of an Unpaid
 *      leave to dock salary.
 * They agree because both funnel through countWorkingDays() with the SAME
 * calendar resolved by calendarForEmployee() — never by re-deriving scope
 * locally. Changing the rules here changes both together, by construction.
 *
 * Calendar scope follows the repo-wide "unscoped row applies everywhere,
 * scoped row applies only to its own scope" convention already used by
 * pay-deduction-rule: a holiday with no company applies to every company, one
 * with a company applies only there (same for branch).
 *
 * Branch comes from the employee's active pay-employee-profile because
 * hr-employee has no branch of its own. Only the branch *id* is read — never a
 * salary field — so the pay-profile privacy wall stays intact, and it is read
 * here (one place) rather than at each call site so leave and payroll cannot
 * drift onto different branch calendars.
 */

const HOLIDAY_UID = 'api::hr-holiday-calendar.hr-holiday-calendar';
const EMP_UID = 'api::hr-employee.hr-employee';
const PROFILE_UID = 'api::pay-employee-profile.pay-employee-profile';

const DAY_MS = 86400000;

// Sunday-only. The prevailing working week in the deployments this ships to;
// overridden per company by hr-company.weekend_days.
const DEFAULT_WEEKEND_DAYS = [0];

/** 'YYYY-MM-DD' (or a Date) -> UTC-midnight Date. Null when unparseable. */
function toUtcDay(value) {
  if (!value) return null;
  const str = typeof value === 'string' ? value.slice(0, 10) : null;
  const d = str ? new Date(`${str}T00:00:00.000Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const ymd = (d) => d.toISOString().slice(0, 10);
const monthDay = (d) => ymd(d).slice(5); // 'MM-DD'

/** Normalise however weekend_days was stored -> array of 0..6 ints. */
function normaliseWeekendDays(raw) {
  if (raw == null) return DEFAULT_WEEKEND_DAYS;
  let list = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { return DEFAULT_WEEKEND_DAYS; }
  }
  if (!Array.isArray(list)) return DEFAULT_WEEKEND_DAYS;
  // An explicit empty array is meaningful ("we work every day") — only fall
  // back to the default when the value was unusable.
  if (list.length === 0) return [];
  const out = list
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return out.length ? out : DEFAULT_WEEKEND_DAYS;
}

/**
 * The set of 'YYYY-MM-DD' holiday dates covering [startStr, endStr] for one
 * calendar scope. Recurring rows are expanded onto every year the range spans,
 * so a calendar entered once keeps working in later years.
 */
async function loadHolidayDates(strapi, startStr, endStr, { companyId = null, branchId = null } = {}) {
  const start = toUtcDay(startStr);
  const end = toUtcDay(endStr);
  const dates = new Set();
  if (!start || !end || end < start) return dates;

  let rows;
  try {
    rows = await strapi.documents(HOLIDAY_UID).findMany({
      filters: {
        $or: [
          { is_recurring_yearly: { $eq: true } },
          { date: { $gte: ymd(start), $lte: ymd(end) } },
        ],
      },
      fields: ['date', 'is_recurring_yearly'],
      populate: { company: { fields: ['id'] }, branch: { fields: ['id'] } },
      pagination: { pageSize: 1000 },
    });
  } catch (err) {
    // Content type may not be migrated yet on a fresh boot — a missing holiday
    // calendar must never take down leave submission or a payroll run.
    strapi.log.warn(`[working-days] holiday calendar load failed: ${err.message}`);
    return dates;
  }

  for (const h of rows || []) {
    if (h.company?.id && h.company.id !== companyId) continue;
    if (h.branch?.id && h.branch.id !== branchId) continue;
    const day = toUtcDay(h.date);
    if (!day) continue;

    if (!h.is_recurring_yearly) {
      dates.add(ymd(day));
      continue;
    }
    const md = monthDay(day);
    for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) {
      const occurrence = toUtcDay(`${y}-${md}`);
      // Guards 02-29 in a non-leap year, which Date would roll into 03-01.
      if (occurrence && monthDay(occurrence) === md) dates.add(ymd(occurrence));
    }
  }
  return dates;
}

/**
 * The calendar one employee is measured against: their company's weekend, plus
 * every holiday in scope for their company/branch over [startStr, endStr].
 * Degrades to "weekends only" when the employee cannot be resolved.
 */
async function calendarForEmployee(strapi, employeeDocId, startStr, endStr) {
  let companyId = null;
  let branchId = null;
  let weekendDays = DEFAULT_WEEKEND_DAYS;

  if (employeeDocId) {
    try {
      const emp = await strapi.documents(EMP_UID).findOne({
        documentId: employeeDocId,
        fields: ['documentId'],
        populate: { company: { fields: ['id', 'weekend_days'] } },
      });
      if (emp?.company?.id) {
        companyId = emp.company.id;
        weekendDays = normaliseWeekendDays(emp.company.weekend_days);
      }
    } catch (err) {
      strapi.log.warn(`[working-days] company lookup failed for ${employeeDocId}: ${err.message}`);
    }

    try {
      const profiles = await strapi.documents(PROFILE_UID).findMany({
        filters: { employee: { documentId: { $eq: employeeDocId } }, is_active: { $eq: true } },
        fields: ['documentId'],
        populate: { branch: { fields: ['id'] } },
        pagination: { pageSize: 1 },
      });
      branchId = profiles?.[0]?.branch?.id || null;
    } catch (err) {
      strapi.log.warn(`[working-days] pay-profile branch lookup failed for ${employeeDocId}: ${err.message}`);
    }
  }

  const holidays = await loadHolidayDates(strapi, startStr, endStr, { companyId, branchId });
  return { holidays, weekendDays, companyId, branchId };
}

/**
 * Working days in [startStr, endStr] inclusive, skipping weekend days and
 * holidays. Returns 0 for an inverted or unparseable range — and legitimately
 * for a leave taken entirely across a weekend, which costs nothing.
 */
function countWorkingDays(startStr, endStr, { holidays = new Set(), weekendDays = DEFAULT_WEEKEND_DAYS } = {}) {
  const start = toUtcDay(startStr);
  const end = toUtcDay(endStr);
  if (!start || !end || end < start) return 0;

  const weekend = new Set(weekendDays);
  let count = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const day = new Date(t);
    if (weekend.has(day.getUTCDay())) continue;
    if (holidays.has(ymd(day))) continue;
    count++;
  }
  return count;
}

/** calendarForEmployee + countWorkingDays — the one-shot form both callers use. */
async function countWorkingDaysForEmployee(strapi, employeeDocId, startStr, endStr) {
  const calendar = await calendarForEmployee(strapi, employeeDocId, startStr, endStr);
  return countWorkingDays(startStr, endStr, calendar);
}

module.exports = {
  loadHolidayDates,
  calendarForEmployee,
  countWorkingDays,
  countWorkingDaysForEmployee,
  normaliseWeekendDays,
  toUtcDay,
  ymd,
  DEFAULT_WEEKEND_DAYS,
};
