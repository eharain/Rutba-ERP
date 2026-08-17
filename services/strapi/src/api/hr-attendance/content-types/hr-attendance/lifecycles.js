'use strict';

/**
 * Attendance derivation + ownership mirroring.
 *
 * 1. `owners` — mirrors the repo-wide ownership convention onto rows created by
 *    HR/import rather than through a self-service controller. Data consistency
 *    only; myAttendance/teamAttendance scope on the `employee` relation, not
 *    `owners` (see utils/hr-access.js).
 *
 * 2. Shift derivation — resolves the employee's hr-roster for the date and
 *    settles `status`, `worked_hours` and the `shift` stamp against the
 *    rostered hr-shift. Before this, hr-shift carried start_time/grace_minutes/
 *    break_minutes that nothing read: "Late" was whatever a human typed, so the
 *    grace period was advisory and two clerks could disagree about the same
 *    check-in. Now the roster decides.
 *
 * Derivation only ever chooses between Present and Late — an explicit Absent or
 * Leave is a statement about the day that a clock-in time does not overrule.
 * With no roster (or no shift start_time) there is nothing to be late against,
 * so the incoming status stands and only worked_hours is derived.
 */

const { ownerUserIdForEmployeeRef, relTargetKey } = require('../../../../utils/hr-access');

const ATT_UID = 'api::hr-attendance.hr-attendance';
const EMP_UID = 'api::hr-employee.hr-employee';
const ROSTER_UID = 'api::hr-roster.hr-roster';

// Statuses that describe the day rather than the clock — never auto-changed.
const NON_DERIVABLE_STATUSES = new Set(['Absent', 'Leave']);

/** 'HH:mm:ss.SSS' | 'HH:mm' -> minutes past midnight, or null. */
function toMinutes(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min + (Number(m[3] || 0) / 60);
}

async function employeeDocIdFor(strapi, data, current) {
  const target = relTargetKey(data?.employee);
  if (target?.documentId) return target.documentId;
  if (target?.id != null) {
    const emp = await strapi.db.query(EMP_UID).findOne({ where: { id: target.id }, select: ['documentId'] });
    if (emp?.documentId) return emp.documentId;
  }
  return current?.employee?.documentId || null;
}

/** The stored row behind an update — updates arrive partial (often just check_out). */
async function loadCurrent(strapi, where) {
  if (where?.id == null) return null;
  try {
    return await strapi.db.query(ATT_UID).findOne({
      where: { id: where.id },
      select: ['date', 'status', 'check_in', 'check_out'],
      populate: { employee: { select: ['documentId'] } },
    });
  } catch (err) {
    strapi.log.warn(`[hr-attendance] current row load failed: ${err.message}`);
    return null;
  }
}

async function rosteredShift(strapi, employeeDocId, date) {
  if (!employeeDocId || !date) return null;
  try {
    const rows = await strapi.documents(ROSTER_UID).findMany({
      filters: {
        employee: { documentId: { $eq: employeeDocId } },
        date: { $eq: String(date).slice(0, 10) },
      },
      fields: ['documentId'],
      populate: { shift: { fields: ['id', 'start_time', 'grace_minutes', 'break_minutes', 'is_active'] } },
      pagination: { pageSize: 1 },
    });
    const shift = rows?.[0]?.shift || null;
    return shift && shift.is_active !== false ? shift : null;
  } catch (err) {
    strapi.log.warn(`[hr-attendance] roster lookup failed: ${err.message}`);
    return null;
  }
}

async function deriveFromShift(strapi, data, current) {
  // Merge the payload over the stored row so a partial update still derives
  // against the full picture.
  const date = data.date ?? current?.date ?? null;
  const checkIn = data.check_in !== undefined ? data.check_in : current?.check_in;
  const checkOut = data.check_out !== undefined ? data.check_out : current?.check_out;
  const status = data.status ?? current?.status ?? null;

  const employeeDocId = await employeeDocIdFor(strapi, data, current);
  const shift = await rosteredShift(strapi, employeeDocId, date);
  if (shift?.id && data.shift === undefined) data.shift = shift.id;

  const inMin = toMinutes(checkIn);
  const outMin = toMinutes(checkOut);

  // --- worked_hours: clocked span, less the rostered unpaid break ---
  if (inMin != null && outMin != null) {
    // A check-out before check-in is an overnight shift, not a negative day.
    const spanMin = (outMin >= inMin ? outMin : outMin + 24 * 60) - inMin;
    const net = spanMin - Number(shift?.break_minutes || 0);
    data.worked_hours = Math.round(Math.max(0, net) / 60 * 100) / 100;
  } else if (data.check_in !== undefined || data.check_out !== undefined) {
    // Times were touched but no longer form a complete pair — drop the stale total.
    data.worked_hours = null;
  }

  // --- status: Present vs Late, against the rostered start + grace ---
  if (NON_DERIVABLE_STATUSES.has(status)) return;
  const startMin = toMinutes(shift?.start_time);
  if (startMin == null || inMin == null) return;
  data.status = inMin > startMin + Number(shift?.grace_minutes || 0) ? 'Late' : 'Present';
}

module.exports = {
  async beforeCreate(event) {
    const data = event.params?.data || {};
    if (!data.owners) {
      const ownerId = await ownerUserIdForEmployeeRef(strapi, data.employee);
      if (ownerId) data.owners = [ownerId];
    }
    await deriveFromShift(strapi, data, null);
  },

  async beforeUpdate(event) {
    const data = event.params?.data || {};
    const current = await loadCurrent(strapi, event.params?.where);
    await deriveFromShift(strapi, data, current);
  },
};
