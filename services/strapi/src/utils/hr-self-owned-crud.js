'use strict';

/**
 * Factory for the repeated "list/create/update/delete MY OWN rows" shape
 * needed by every Employee Master sub-entity (emergency contacts, bank
 * accounts, family members, education, work experience, certifications,
 * skills, documents) — each is a manyToOne `employee` relation with no
 * report/manager scope, just plain self-ownership.
 *
 * `resolveOrCreateEmployeeForUser` (not the non-creating variant) is used
 * deliberately: these are genuine ESS self-service entry points, so the
 * caller's hr-employee record is auto-provisioned on first touch exactly
 * like myRequests/myAttendance/myPayslips/myProfile (see hr-access.js).
 */

const { resolveOrCreateEmployeeForUser } = require('./hr-access');

async function loadActor(ctx) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({ where: { id } });
}

/**
 * @param {string} uid content-type UID, e.g. 'api::hr-skill.hr-skill'
 * @param {object} [opts]
 * @param {string[]} [opts.sort] default sort for myList
 * @param {object} [opts.populate] default populate for myList
 */
function createSelfOwnedActions(uid, { sort, populate } = {}) {
  return {
    /** The caller's own rows for this sub-entity. */
    async myList(ctx) {
      const user = await loadActor(ctx);
      if (!user) return ctx.unauthorized('You must be logged in');

      const employee = await resolveOrCreateEmployeeForUser(strapi, user);
      if (!employee) return ctx.send({ data: [] });

      const rows = await strapi.documents(uid).findMany({
        filters: { employee: { documentId: { $eq: employee.documentId } } },
        sort: sort || ['id:asc'],
        populate,
        pagination: { pageSize: 200 },
      });
      return ctx.send({ data: rows || [] });
    },

    /** Create a row owned by the caller (employee is forced, not caller-supplied). */
    async myCreate(ctx) {
      const user = await loadActor(ctx);
      if (!user) return ctx.unauthorized('You must be logged in');

      const employee = await resolveOrCreateEmployeeForUser(strapi, user);
      if (!employee) return ctx.badRequest('No employee record for this account');

      const body = ctx.request.body || {};
      const data = body.data || body || {};
      data.employee = employee.documentId;

      const created = await strapi.documents(uid).create({ data, populate });
      return ctx.send({ data: created });
    },

    /** Update a row the caller owns (403 if it belongs to someone else). */
    async myUpdate(ctx) {
      const user = await loadActor(ctx);
      if (!user) return ctx.unauthorized('You must be logged in');

      const { documentId } = ctx.params;
      const current = await strapi.documents(uid).findOne({
        documentId,
        populate: { employee: { populate: ['user'] } },
      });
      if (!current) return ctx.notFound();

      const employee = await resolveOrCreateEmployeeForUser(strapi, user);
      if (!employee || current.employee?.documentId !== employee.documentId) {
        return ctx.forbidden('You can only edit your own records');
      }

      const body = ctx.request.body || {};
      const data = body.data || body || {};
      delete data.employee; // ownership can't be reassigned via self-service

      const updated = await strapi.documents(uid).update({ documentId, data, populate });
      return ctx.send({ data: updated });
    },

    /** Delete a row the caller owns (403 if it belongs to someone else). */
    async myDelete(ctx) {
      const user = await loadActor(ctx);
      if (!user) return ctx.unauthorized('You must be logged in');

      const { documentId } = ctx.params;
      const current = await strapi.documents(uid).findOne({
        documentId,
        populate: { employee: true },
      });
      if (!current) return ctx.notFound();

      const employee = await resolveOrCreateEmployeeForUser(strapi, user);
      if (!employee || current.employee?.documentId !== employee.documentId) {
        return ctx.forbidden('You can only delete your own records');
      }

      await strapi.documents(uid).delete({ documentId });
      return ctx.send({ data: { documentId } });
    },
  };
}

module.exports = { createSelfOwnedActions };
