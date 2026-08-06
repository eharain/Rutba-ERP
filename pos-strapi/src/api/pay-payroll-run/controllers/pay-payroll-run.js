'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { loadActor, isPayrollManager } = require('../../../utils/payroll-access');

const PR_UID = 'api::pay-payroll-run.pay-payroll-run';

// Shared payroll gate, same as pay-payslip. The previous guard populated a
// `permission_roles` relation that has no schema, so it always came back empty
// and every non-super-admin — the payroll managers these actions exist for —
// was refused, which left the run's GL postings unreachable.
async function guard(ctx, strapi) {
  const user = await loadActor(ctx, strapi);
  if (!user) { ctx.unauthorized('You must be logged in'); return null; }
  if (!isPayrollManager(ctx, user)) { ctx.forbidden('Payroll access is required'); return null; }
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
