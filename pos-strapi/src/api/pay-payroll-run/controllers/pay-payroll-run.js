'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole } = require('../../../utils/require-admin');

const PR_UID = 'api::pay-payroll-run.pay-payroll-run';

// requireAppRole reads the caller's REAL app_roles. The previous guard
// populated a `permission_roles` relation that has no schema, so it always came
// back empty and every non-super-admin — the payroll managers these actions
// exist for — was refused. `domains` are role-key prefixes.
async function guard(ctx, strapi) {
  return requireAppRole(ctx, strapi, {
    domains: ['payroll', 'auth'],
    levels: ['admin', 'manager'],
    message: 'Payroll access is required',
  });
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
