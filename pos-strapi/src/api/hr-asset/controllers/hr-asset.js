'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

const ASSET_UID = 'api::hr-asset.hr-asset';
const ASSIGN_UID = 'api::hr-asset-assignment.hr-asset-assignment';

module.exports = createCoreController(ASSET_UID, ({ strapi }) => ({
  /** HR assigns an asset to an employee — creates the assignment row and flips the asset to Assigned. */
  async assign(ctx) {
    const { documentId } = ctx.params;
    const asset = await strapi.documents(ASSET_UID).findOne({ documentId });
    if (!asset) return ctx.notFound('Asset not found');
    if (asset.status === 'Assigned') return ctx.badRequest('This asset is already assigned');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    if (!body.employee) return ctx.badRequest('employee is required');

    const assignment = await strapi.documents(ASSIGN_UID).create({
      data: {
        asset: documentId,
        employee: body.employee,
        assigned_date: body.assigned_date || new Date().toISOString().slice(0, 10),
        condition_on_assign: body.condition_on_assign || null,
      },
    });
    await strapi.documents(ASSET_UID).update({ documentId, data: { status: 'Assigned' } });

    return ctx.send({ data: assignment });
  },
}));
