'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

const PR_UID = 'api::pay-payroll-run.pay-payroll-run';

async function getAuthUser(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: {
      role: { select: ['type'] },
      permission_roles: { select: ['level'], populate: { domain: { select: ['key'] } } },
    },
  });
}

function isPayrollManager(user) {
  if (user?.role?.type === 'admin') return true;
  const adminDomains = (user?.permission_roles || [])
    .filter((r) => r?.level === 'admin')
    .map((r) => r?.domain?.key)
    .filter(Boolean);
  return adminDomains.includes('payroll') || adminDomains.includes('auth');
}

async function guard(ctx, strapi) {
  const user = await getAuthUser(ctx, strapi);
  if (!user) { ctx.unauthorized('You must be logged in'); return null; }
  if (!isPayrollManager(user)) { ctx.forbidden('Payroll access is required'); return null; }
  return user;
}

module.exports = createCoreController(PR_UID, ({ strapi }) => ({
  async preview(ctx) {
    const user = await guard(ctx, strapi);
    if (!user) return;
    try {
      return ctx.send({ data: await strapi.service(PR_UID).previewRun(ctx.params.documentId) });
    } catch (e) {
      return ctx.throw(e.status || 500, e.message);
    }
  },

  async process(ctx) {
    const user = await guard(ctx, strapi);
    if (!user) return;
    try {
      return ctx.send({ data: await strapi.service(PR_UID).processRun(ctx.params.documentId, { user }) });
    } catch (e) {
      return ctx.throw(e.status || 500, e.message);
    }
  },

  async cancel(ctx) {
    const user = await guard(ctx, strapi);
    if (!user) return;
    try {
      return ctx.send({ data: await strapi.service(PR_UID).cancelRun(ctx.params.documentId, { user }) });
    } catch (e) {
      return ctx.throw(e.status || 500, e.message);
    }
  },
}));
