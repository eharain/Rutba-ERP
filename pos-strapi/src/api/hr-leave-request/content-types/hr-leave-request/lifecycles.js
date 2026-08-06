'use strict';

/**
 * Derive total_days from start_date/end_date whenever both are present in a
 * create or update payload. Keeps the field authoritative server-side rather
 * than trusting the client to send it; a status-only update (e.g. an approval)
 * carries no dates, so it is left as-is.
 *
 * The count is WORKING days — weekends and the hr-holiday-calendar are
 * excluded (see utils/working-days.js). A calendar day count would over-deduct
 * an employee's balance for every weekend and public holiday their leave
 * happens to span, so a week off around Eid cost more balance than a week off
 * that didn't. The payroll engine docks unpaid leave through the same helper,
 * so what the balance is charged and what salary is docked always agree.
 *
 * A range falling entirely on non-working days legitimately yields 0 — the
 * employee took nothing chargeable, so nothing is deducted.
 */

const { countWorkingDaysForEmployee } = require('../../../../utils/working-days');
const { relTargetKey } = require('../../../../utils/hr-access');

const LR_UID = 'api::hr-leave-request.hr-leave-request';
const EMP_UID = 'api::hr-employee.hr-employee';

/**
 * The employee this write belongs to, as a documentId. Prefers the write
 * payload, then falls back to the stored row — an update that only moves the
 * dates carries no `employee`, and without the fallback the recount would run
 * against no calendar and silently ignore the company's holidays.
 */
async function employeeDocIdFor(strapi, data, where) {
  const target = relTargetKey(data?.employee);
  if (target?.documentId) return target.documentId;
  if (target?.id != null) {
    const emp = await strapi.db.query(EMP_UID).findOne({ where: { id: target.id }, select: ['documentId'] });
    if (emp?.documentId) return emp.documentId;
  }
  if (where?.id != null) {
    const row = await strapi.db.query(LR_UID).findOne({
      where: { id: where.id },
      select: ['id'],
      populate: { employee: { select: ['documentId'] } },
    });
    if (row?.employee?.documentId) return row.employee.documentId;
  }
  return null;
}

async function computeTotalDays(strapi, data, where) {
  if (!data || !data.start_date || !data.end_date) return;

  const employeeDocId = await employeeDocIdFor(strapi, data, where);
  try {
    data.total_days = await countWorkingDaysForEmployee(
      strapi, employeeDocId, data.start_date, data.end_date,
    );
  } catch (err) {
    // Never block a leave submission on a calendar problem — fall back to the
    // inclusive calendar-day count this lifecycle used before holidays existed.
    strapi.log.warn(`[hr-leave-request] working-day count failed: ${err.message}`);
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    const days = Math.floor((end - start) / 86400000) + 1;
    if (days > 0) data.total_days = days;
  }
}

module.exports = {
  async beforeCreate(event) {
    await computeTotalDays(strapi, event.params.data, null);
  },
  async beforeUpdate(event) {
    await computeTotalDays(strapi, event.params.data, event.params.where);
  },
};
