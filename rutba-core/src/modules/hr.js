'use strict';

/**
 * HR / payroll / work-item-collaboration tranche (playbook tranche 2).
 *
 * Same zero-copy porting model as mfg (see ./mfg.js): controllers, the
 * leave-request state machine, the payroll engine service, lifecycles and the
 * HR role provider are require()d from pos-strapi source and run against the
 * compat strapi.
 *
 * Auth model differs from mfg: most HR/pay custom routes are AUTHENTICATED
 * Strapi routes (no auth:false), so core gates them through the api-pro
 * interceptor exactly like seeded routes — each route entry carries uid +
 * action for policy matching (action = handler-method name, the api-pro
 * convention). Only the work-item assign/toggle endpoints are auth:false +
 * ensureUser in Strapi → selfAuth here.
 *
 * Several controllers are createCoreController factories that OVERRIDE core
 * actions (leave-request create, hr-team create/update, comment create) and
 * call super.create/update — instantiateController gives them the default
 * REST handlers as prototype, and the routes below claim the core verb+path
 * ahead of the seeded table so the override actually serves the route.
 *
 * Crons: none (pos-strapi schedules no hr/pay tasks).
 */

const path = require('path');
const { posRequire, instantiateController } = require('../compat/strapi');
const { registerLifecycles } = require('./lifecycles');

function ctrl(apiName, strapi) {
  return instantiateController(
    posRequire(path.join('api', apiName, 'controllers', `${apiName}.js`)),
    strapi
  );
}

function registerHrModule() {
  const strapi = global.strapi;

  // ── Document middlewares ────────────────────────────────────────────────
  registerLifecycles(
    'api::hr-leave-request.hr-leave-request',
    posRequire('api/hr-leave-request/content-types/hr-leave-request/lifecycles.js')
  );
  // The generic assign endpoint writes sale-orders / return-requests — run
  // their (thin) lifecycles so core writes keep parity. Their owning tranche
  // (7) inherits these registrations.
  registerLifecycles(
    'api::sale-order.sale-order',
    posRequire('api/sale-order/content-types/sale-order/lifecycles.js')
  );
  registerLifecycles(
    'api::return-request.return-request',
    posRequire('api/return-request/content-types/return-request/lifecycles.js')
  );

  // ── /me/permissions parity: HR team-role provider ───────────────────────
  // pos-strapi registers this in bootstrap; me-permissions merges provider
  // roles per request.
  const { resolveHrRolesForUser } = posRequire('utils/hr-role-provider.js');
  strapi.apiPro.registerRoleProvider(resolveHrRolesForUser);

  // ── Controllers (zero-copy) ─────────────────────────────────────────────
  const leave = ctrl('hr-leave-request', strapi);
  const team = ctrl('hr-team', strapi);
  const payrollRun = ctrl('pay-payroll-run', strapi);
  const payslip = ctrl('pay-payslip', strapi);
  const remittance = ctrl('pay-statutory-remittance', strapi);
  const adjustment = ctrl('pay-adjustment', strapi);
  const activity = ctrl('work-item-activity', strapi);
  const watch = ctrl('work-item-watch', strapi);
  const comment = ctrl('work-item-comment', strapi);

  const LR = 'api::hr-leave-request.hr-leave-request';
  const TEAM = 'api::hr-team.hr-team';
  const PR = 'api::pay-payroll-run.pay-payroll-run';
  const PS = 'api::pay-payslip.pay-payslip';
  const RM = 'api::pay-statutory-remittance.pay-statutory-remittance';
  const ADJ = 'api::pay-adjustment.pay-adjustment';

  const routes = [
    // Literal paths first (they must beat the :documentId patterns).
    { method: 'get', path: '/api/hr-leave-requests/my-requests', uid: LR, action: 'myRequests', handler: (c) => leave.myRequests(c) },
    { method: 'get', path: '/api/hr-leave-requests/team-queue', uid: LR, action: 'teamQueue', handler: (c) => leave.teamQueue(c) },
    { method: 'post', path: '/api/hr-leave-requests/:documentId/approve', uid: LR, action: 'approve', handler: (c) => leave.approve(c) },
    { method: 'post', path: '/api/hr-leave-requests/:documentId/reject', uid: LR, action: 'reject', handler: (c) => leave.reject(c) },
    { method: 'post', path: '/api/hr-leave-requests/:documentId/cancel', uid: LR, action: 'cancel', handler: (c) => leave.cancel(c) },
    // Core-action override: self-service employee defaulting.
    { method: 'post', path: '/api/hr-leave-requests', uid: LR, action: 'create', handler: (c) => leave.create(c) },

    { method: 'get', path: '/api/hr-teams/app-role-options', uid: TEAM, action: 'appRoleOptions', handler: (c) => team.appRoleOptions(c) },
    { method: 'post', path: '/api/hr-teams', uid: TEAM, action: 'create', handler: (c) => team.create(c) },
    { method: 'put', path: '/api/hr-teams/:documentId', uid: TEAM, action: 'update', handler: (c) => team.update(c) },

    { method: 'post', path: '/api/pay-payroll-runs/:documentId/preview', uid: PR, action: 'preview', handler: (c) => payrollRun.preview(c) },
    { method: 'post', path: '/api/pay-payroll-runs/:documentId/process', uid: PR, action: 'process', handler: (c) => payrollRun.process(c) },
    { method: 'post', path: '/api/pay-payroll-runs/:documentId/cancel', uid: PR, action: 'cancel', handler: (c) => payrollRun.cancel(c) },

    { method: 'get', path: '/api/pay-payslips/my-payslips', uid: PS, action: 'myPayslips', handler: (c) => payslip.myPayslips(c) },
    { method: 'post', path: '/api/pay-payslips/:documentId/mark-paid', uid: PS, action: 'markPaid', handler: (c) => payslip.markPaid(c) },

    { method: 'post', path: '/api/pay-statutory-remittances/:documentId/process', uid: RM, action: 'process', handler: (c) => remittance.process(c) },

    { method: 'post', path: '/api/pay-adjustments/:documentId/disburse', uid: ADJ, action: 'disburse', handler: (c) => adjustment.disburse(c) },

    // Core-action override: author stamping + audit-trail mirror.
    { method: 'post', path: '/api/work-item-comments', uid: 'api::work-item-comment.work-item-comment', action: 'create', handler: (c) => comment.create(c) },

    // auth:false + ensureUser in Strapi → selfAuth here.
    { method: 'post', path: '/api/work-item-activities/assign', selfAuth: true, handler: (c) => activity.assign(c) },
    { method: 'post', path: '/api/work-item-watches/toggle', selfAuth: true, handler: (c) => watch.toggle(c) },
  ].map((r) => ({ ...r, module: 'hr' }));

  return { name: 'hr', routes };
}

module.exports = { registerHrModule };
