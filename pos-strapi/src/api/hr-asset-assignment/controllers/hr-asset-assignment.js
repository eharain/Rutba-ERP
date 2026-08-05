'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveOrCreateEmployeeForUser } = require('../../../utils/hr-access');

const ASSIGN_UID = 'api::hr-asset-assignment.hr-asset-assignment';
const ASSET_UID = 'api::hr-asset.hr-asset';

module.exports = createCoreController(ASSIGN_UID, ({ strapi }) => ({
  /** The caller's own asset assignment history (self-service). */
  async myAssignments(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');

    const user = await strapi.query('plugin::users-permissions.user').findOne({ where: { id } });
    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(ASSIGN_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['assigned_date:desc'],
      populate: ['asset'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** HR processes a return — closes the assignment and frees the asset back to Available. */
  async returnAsset(ctx) {
    const { documentId } = ctx.params;
    const current = await strapi.documents(ASSIGN_UID).findOne({
      documentId,
      populate: { asset: { fields: ['documentId', 'status'] } },
    });
    if (!current) return ctx.notFound('Assignment not found');
    if (current.return_date) return ctx.badRequest('This asset was already returned');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const updated = await strapi.documents(ASSIGN_UID).update({
      documentId,
      data: {
        return_date: body.return_date || new Date().toISOString().slice(0, 10),
        condition_on_return: body.condition_on_return || null,
      },
    });

    if (current.asset?.documentId) {
      await strapi.documents(ASSET_UID).update({
        documentId: current.asset.documentId,
        data: { status: 'Available' },
      });
    }

    return ctx.send({ data: updated });
  },
}));
