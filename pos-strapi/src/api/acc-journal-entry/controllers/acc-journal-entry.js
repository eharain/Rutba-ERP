'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole } = require('../../../utils/require-admin');

const JE_UID = 'api::acc-journal-entry.acc-journal-entry';
const REPORTS = 'api::acc-journal-entry.reports';

async function runReport(ctx, strapi, method, args) {
  // requireAppRole reads the caller's REAL app_roles. The previous guard
  // populated a `permission_roles` relation that has no schema, so it always
  // came back empty and every non-super-admin — the accountants these reports
  // exist for — was refused. `domains` are role-key prefixes, so 'accounts'
  // also admits the read-only `accounts_viewer_*` roles.
  const user = await requireAppRole(ctx, strapi, {
    domains: ['accounts', 'auth'],
    levels: ['admin', 'manager'],
    message: 'Accounts access is required',
  });
  if (!user) return;
  try {
    return ctx.send({ data: await strapi.service(REPORTS)[method](args) });
  } catch (e) {
    return ctx.throw(e.status || 500, e.message);
  }
}

module.exports = createCoreController(JE_UID, ({ strapi }) => ({
  async trialBalance(ctx) {
    const { from, to, branch } = ctx.query;
    return runReport(ctx, strapi, 'trialBalance', { from, to, branch });
  },
  async incomeStatement(ctx) {
    const { from, to, branch } = ctx.query;
    return runReport(ctx, strapi, 'incomeStatement', { from, to, branch });
  },
  async balanceSheet(ctx) {
    const { asOf, branch } = ctx.query;
    return runReport(ctx, strapi, 'balanceSheet', { asOf, branch });
  },
  async cashFlow(ctx) {
    const { from, to, branch } = ctx.query;
    return runReport(ctx, strapi, 'cashFlow', { from, to, branch });
  },
  async arAging(ctx) {
    return runReport(ctx, strapi, 'arAging', { asOf: ctx.query.asOf });
  },
  async apAging(ctx) {
    return runReport(ctx, strapi, 'apAging', { asOf: ctx.query.asOf });
  },
}));
