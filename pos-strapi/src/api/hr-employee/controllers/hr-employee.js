'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveOrCreateEmployeeForUser } = require('../../../utils/hr-access');

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
}));
