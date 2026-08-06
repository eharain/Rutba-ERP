'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveOrCreateEmployeeForUser, isHrManager, ownerUserIdForEmployeeRef } = require('../../../utils/hr-access');

const GRV_UID = 'api::hr-grievance.hr-grievance';

async function loadActor(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: { role: { select: ['type'] } },
  });
}

/**
 * Grievances deliberately break the two-axis pattern used everywhere else in
 * this module: there is NO line-manager scope. A grievance is frequently about
 * the reporting manager, so routing it to them would defeat the purpose. Only
 * an org-wide HR claim (hr_admin/hr_manager) can see the queue; everyone else
 * sees strictly their own. Anonymous submissions additionally have the employee
 * stripped from the queue projection.
 */
module.exports = createCoreController(GRV_UID, ({ strapi }) => ({
  /** The caller's own grievances (self-service). */
  async myGrievances(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(GRV_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['createdAt:desc'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** Raise a grievance — employee is forced to the caller, never client-supplied. */
  async submitGrievance(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.badRequest('No employee record for this account');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    if (!body.subject) return ctx.badRequest('A subject is required');

    const data = {
      subject: body.subject,
      description: body.description || null,
      category: body.category || 'Other',
      is_anonymous: Boolean(body.is_anonymous),
      status: 'Open',
      // The link is always stored (an anonymous grievance still needs to reach
      // its author's "mine" list); anonymity is enforced on the read side.
      employee: employee.documentId,
    };
    const ownerId = await ownerUserIdForEmployeeRef(strapi, data.employee);
    if (ownerId) data.owners = [ownerId];

    const created = await strapi.documents(GRV_UID).create({ data });
    return ctx.send({ data: created });
  },

  /** HR-only queue. Anonymous rows have the reporter stripped before sending. */
  async grievanceQueue(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');
    if (!isHrManager(ctx, user)) return ctx.forbidden('HR access is required');

    const rows = await strapi.documents(GRV_UID).findMany({
      filters: { status: { $in: ['Open', 'UnderReview'] } },
      sort: ['createdAt:desc'],
      populate: { employee: { fields: ['name'] } },
      pagination: { pageSize: 200 },
    });

    const projected = (rows || []).map((r) => (r.is_anonymous ? { ...r, employee: null } : r));
    return ctx.send({ data: projected });
  },

  /** HR records the outcome. */
  async resolveGrievance(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');
    if (!isHrManager(ctx, user)) return ctx.forbidden('HR access is required');

    const { documentId } = ctx.params;
    const current = await strapi.documents(GRV_UID).findOne({ documentId });
    if (!current) return ctx.notFound('Grievance not found');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const status = body.status || 'Resolved';
    if (!['UnderReview', 'Resolved', 'Closed'].includes(status)) {
      return ctx.badRequest('status must be UnderReview, Resolved or Closed');
    }

    const updated = await strapi.documents(GRV_UID).update({
      documentId,
      data: {
        status,
        resolution: body.resolution ?? current.resolution,
        resolved_at: status === 'Open' ? null : new Date().toISOString(),
        resolved_by: user.id,
      },
    });
    return ctx.send({ data: updated });
  },
}));
