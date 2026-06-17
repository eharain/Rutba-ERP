'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

const JE_UID = 'api::acc-journal-entry.acc-journal-entry';
const REPORTS = 'api::acc-journal-entry.reports';

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

function isAccountant(user) {
  if (user?.role?.type === 'admin') return true;
  const adminDomains = (user?.permission_roles || [])
    .filter((r) => r?.level === 'admin')
    .map((r) => r?.domain?.key)
    .filter(Boolean);
  return adminDomains.includes('accounts') || adminDomains.includes('auth');
}

async function runReport(ctx, strapi, method, args) {
  const user = await getAuthUser(ctx, strapi);
  if (!user) return ctx.unauthorized('You must be logged in');
  if (!isAccountant(user)) return ctx.forbidden('Accounts access is required');
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
