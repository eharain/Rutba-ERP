'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const {
  resolveOrCreateEmployeeForUser,
  resolveEmployeeForUser,
  isHrManager,
  managedReportDocIds,
} = require('../../../utils/hr-access');
const { buildDashboard, headcountByDepartment } = require('../../../utils/hr-analytics');

const EMP_UID = 'api::hr-employee.hr-employee';

const PROFILE_FIELDS = [
  'name', 'email', 'phone', 'designation', 'date_of_joining', 'status', 'address',
  'cnic', 'passport_number', 'nationality', 'religion', 'gender', 'date_of_birth',
  'marital_status', 'blood_group',
];

// Personal/contact fields the employee may edit themselves. Employment fields
// (name, designation, date_of_joining, status, department, position, company,
// salary_structure, reports_to, user) stay HR-controlled.
const SELF_EDITABLE_FIELDS = [
  'phone', 'address', 'cnic', 'passport_number', 'nationality', 'religion',
  'gender', 'date_of_birth', 'marital_status', 'blood_group',
];

module.exports = createCoreController(EMP_UID, ({ strapi }) => ({
  /** The caller's own profile (self-service; excludes payroll-sensitive fields). */
  async myProfile(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');

    const user = await strapi.query('plugin::users-permissions.user').findOne({ where: { id } });
    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: null });

    const row = await strapi.documents(EMP_UID).findOne({
      documentId: employee.documentId,
      fields: PROFILE_FIELDS,
      populate: { department: { fields: ['name'] } },
    });
    return ctx.send({ data: row });
  },

  /** Self-edit of personal/contact fields only — employment fields are HR-controlled. */
  async updateMyProfile(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');

    const user = await strapi.query('plugin::users-permissions.user').findOne({ where: { id } });
    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.badRequest('No employee record for this account');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const data = {};
    for (const field of SELF_EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) data[field] = body[field];
    }

    const updated = await strapi.documents(EMP_UID).update({
      documentId: employee.documentId,
      data,
      fields: PROFILE_FIELDS,
      populate: { department: { fields: ['name'] } },
    });
    return ctx.send({ data: updated });
  },

  /**
   * Role-scoped HR dashboard. The scope is resolved once and every metric is
   * computed inside it: HR claim → org-wide (null scope), line manager → their
   * reports plus themselves, plain employee → themselves only. `by_department`
   * is omitted for a plain employee since a one-row breakdown leaks nothing
   * useful and invites confusion.
   */
  async dashboard(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');

    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id },
      populate: { role: { select: ['type'] } },
    });

    let scope = null; // null == org-wide
    let level = 'hr';
    if (!isHrManager(ctx, user)) {
      const employee = await resolveOrCreateEmployeeForUser(strapi, user);
      if (!employee) return ctx.send({ data: null });
      const reports = await managedReportDocIds(strapi, employee.documentId);
      scope = reports.length ? [...reports, employee.documentId] : [employee.documentId];
      level = reports.length ? 'manager' : 'employee';
    }

    const data = await buildDashboard(strapi, scope);
    data.scope = level;
    if (level !== 'employee') {
      data.by_department = await headcountByDepartment(strapi, scope);
    }
    return ctx.send({ data });
  },
}));
