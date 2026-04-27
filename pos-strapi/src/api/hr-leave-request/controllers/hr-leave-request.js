'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

async function getAuthUser(ctx, strapi) {
  if (ctx.state?.user?.id) return ctx.state.user;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id: ctx.state?.user?.id },
  });
}

async function resolveEmployeeForUser(strapi, user) {
  if (!user?.id) return null;

  const linked = await strapi.documents('api::hr-employee.hr-employee').findMany({
    filters: { user: { id: { $eq: user.id } } },
    fields: ['documentId', 'name', 'email', 'designation'],
    pagination: { pageSize: 1 },
  });

  if (linked?.[0]) return linked[0];

  if (!user?.email) return null;
  const fallback = await strapi.documents('api::hr-employee.hr-employee').findMany({
    filters: { email: { $eqi: user.email } },
    fields: ['documentId', 'name', 'email', 'designation'],
    pagination: { pageSize: 1 },
  });
  return fallback?.[0] || null;
}

function isManagerLike(user) {
  const adminAppAccess = (user?.admin_app_accesses || []).map((a) => a.key);
  return adminAppAccess.includes('hr') || adminAppAccess.includes('auth');
}

module.exports = createCoreController('api::hr-leave-request.hr-leave-request', ({ strapi }) => ({
  async myRequests(ctx) {
    const user = await getAuthUser(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents('api::hr-leave-request.hr-leave-request').findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['createdAt:desc'],
      populate: ['employee'],
      pagination: { pageSize: 200 },
    });

    return ctx.send({ data: rows || [] });
  },

  async teamQueue(ctx) {
    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id: ctx.state?.user?.id },
      populate: { admin_app_accesses: { select: ['key'] } },
    });
    if (!user) return ctx.unauthorized('You must be logged in');
    if (!isManagerLike(user)) return ctx.forbidden('Manager access is required');

    const rows = await strapi.documents('api::hr-leave-request.hr-leave-request').findMany({
      filters: { status: { $eq: 'Pending' } },
      sort: ['createdAt:desc'],
      populate: ['employee'],
      pagination: { pageSize: 200 },
    });

    return ctx.send({ data: rows || [] });
  },

  async approve(ctx) {
    const { documentId } = ctx.params;
    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id: ctx.state?.user?.id },
      populate: { admin_app_accesses: { select: ['key'] } },
    });
    if (!user) return ctx.unauthorized('You must be logged in');
    if (!isManagerLike(user)) return ctx.forbidden('Manager access is required');

    const current = await strapi.documents('api::hr-leave-request.hr-leave-request').findOne({ documentId, populate: ['employee'] });
    if (!current) return ctx.notFound('Leave request not found');

    if (current.status === 'Approved') return ctx.send({ data: current });
    if (current.status === 'Rejected') return ctx.badRequest('Rejected request cannot be approved');

    const updated = await strapi.documents('api::hr-leave-request.hr-leave-request').update({
      documentId,
      data: { status: 'Approved' },
      populate: ['employee'],
    });

    return ctx.send({ data: updated });
  },

  async reject(ctx) {
    const { documentId } = ctx.params;
    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id: ctx.state?.user?.id },
      populate: { admin_app_accesses: { select: ['key'] } },
    });
    if (!user) return ctx.unauthorized('You must be logged in');
    if (!isManagerLike(user)) return ctx.forbidden('Manager access is required');

    const current = await strapi.documents('api::hr-leave-request.hr-leave-request').findOne({ documentId, populate: ['employee'] });
    if (!current) return ctx.notFound('Leave request not found');

    if (current.status === 'Rejected') return ctx.send({ data: current });
    if (current.status === 'Approved') return ctx.badRequest('Approved request cannot be rejected');

    const updated = await strapi.documents('api::hr-leave-request.hr-leave-request').update({
      documentId,
      data: { status: 'Rejected' },
      populate: ['employee'],
    });

    return ctx.send({ data: updated });
  },
}));
