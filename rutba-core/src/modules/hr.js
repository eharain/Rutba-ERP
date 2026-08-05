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
 * Crons: workflowSlaSweep (zero-copy from pos-strapi's
 * config/workflow-cron-tasks.js — scans every SLA-configured
 * api::workflow.workflow for overdue stages; domain-agnostic, registered here
 * only because this tranche is where the workflow-engine's first real
 * consumer, hr-leave-request, lives) and hrBirthdayCheck (zero-copy from
 * pos-strapi's config/hr-cron-tasks.js — daily birthday notification sweep).
 * Both stay DORMANT unless RUTBA_CORE_CRONS=1 — at the tranche flip they
 * start here and must be simultaneously removed from pos-strapi's
 * config/server.js merge (never run in both).
 */

const path = require('path');
const { posRequire, instantiateController } = require('../compat/strapi');
const { registerLifecycles } = require('./lifecycles');
const { registerCron } = require('../platform/cron');

function ctrl(apiName, strapi) {
  return instantiateController(
    posRequire(path.join('api', apiName, 'controllers', `${apiName}.js`)),
    strapi
  );
}

// Sub-entities that only need the repeated "list/create/update/delete MY OWN
// rows" shape (hr-self-owned-crud.js factory in pos-strapi) — one controller
// instance + 4 routes each, no bespoke logic to hand-port per entity.
const SELF_OWNED_ENTITIES = [
  'hr-emergency-contact', 'hr-bank-account', 'hr-family-member', 'hr-education',
  'hr-work-experience', 'hr-certification', 'hr-skill', 'hr-employee-document',
];

function registerHrModule() {
  const strapi = global.strapi;

  // ── Document middlewares ────────────────────────────────────────────────
  registerLifecycles(
    'api::hr-leave-request.hr-leave-request',
    posRequire('api/hr-leave-request/content-types/hr-leave-request/lifecycles.js')
  );
  registerLifecycles(
    'api::hr-attendance.hr-attendance',
    posRequire('api/hr-attendance/content-types/hr-attendance/lifecycles.js')
  );
  registerLifecycles(
    'api::pay-payslip.pay-payslip',
    posRequire('api/pay-payslip/content-types/pay-payslip/lifecycles.js')
  );
  registerLifecycles(
    'api::hr-employee-document.hr-employee-document',
    posRequire('api/hr-employee-document/content-types/hr-employee-document/lifecycles.js')
  );
  registerLifecycles(
    'api::pay-bonus.pay-bonus',
    posRequire('api/pay-bonus/content-types/pay-bonus/lifecycles.js')
  );
  registerLifecycles(
    'api::hr-benefit-enrollment.hr-benefit-enrollment',
    posRequire('api/hr-benefit-enrollment/content-types/hr-benefit-enrollment/lifecycles.js')
  );
  registerLifecycles(
    'api::hr-asset-assignment.hr-asset-assignment',
    posRequire('api/hr-asset-assignment/content-types/hr-asset-assignment/lifecycles.js')
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

  // ── Crons (zero-copy from pos-strapi config) ────────────────────────────
  const buildWorkflowCronTasks = posRequire('../config/workflow-cron-tasks.js');
  for (const [name, t] of Object.entries(buildWorkflowCronTasks())) {
    registerCron(name, t.options.rule, () => t.task({ strapi: global.strapi }));
  }
  const buildHrCronTasks = posRequire('../config/hr-cron-tasks.js');
  for (const [name, t] of Object.entries(buildHrCronTasks())) {
    registerCron(name, t.options.rule, () => t.task({ strapi: global.strapi }));
  }

  // ── /me/permissions parity: HR team-role + ESS role providers ───────────
  // pos-strapi registers these in bootstrap; me-permissions merges provider
  // roles per request.
  const { resolveHrRolesForUser } = posRequire('utils/hr-role-provider.js');
  strapi.apiPro.registerRoleProvider(resolveHrRolesForUser);
  const { resolveEssRolesForUser } = posRequire('utils/ess-role-provider.js');
  strapi.apiPro.registerRoleProvider(resolveEssRolesForUser);

  // ── Controllers (zero-copy) ─────────────────────────────────────────────
  const leave = ctrl('hr-leave-request', strapi);
  const team = ctrl('hr-team', strapi);
  const employee = ctrl('hr-employee', strapi);
  const attendance = ctrl('hr-attendance', strapi);
  const lifecycleEvent = ctrl('hr-lifecycle-event', strapi);
  const roster = ctrl('hr-roster', strapi);
  const benefitEnrollment = ctrl('hr-benefit-enrollment', strapi);
  const bonus = ctrl('pay-bonus', strapi);
  const loan = ctrl('pay-loan', strapi);
  const advance = ctrl('pay-advance', strapi);
  const expenseClaim = ctrl('hr-expense-claim', strapi);
  const asset = ctrl('hr-asset', strapi);
  const assetAssignment = ctrl('hr-asset-assignment', strapi);
  const payrollRun = ctrl('pay-payroll-run', strapi);
  const payslip = ctrl('pay-payslip', strapi);
  const remittance = ctrl('pay-statutory-remittance', strapi);
  const activity = ctrl('work-item-activity', strapi);
  const watch = ctrl('work-item-watch', strapi);
  const comment = ctrl('work-item-comment', strapi);
  const selfOwned = Object.fromEntries(SELF_OWNED_ENTITIES.map((name) => [name, ctrl(name, strapi)]));

  const LR = 'api::hr-leave-request.hr-leave-request';
  const TEAM = 'api::hr-team.hr-team';
  const EMP = 'api::hr-employee.hr-employee';
  const ATT = 'api::hr-attendance.hr-attendance';
  const LE = 'api::hr-lifecycle-event.hr-lifecycle-event';
  const ROSTER = 'api::hr-roster.hr-roster';
  const ENROLL = 'api::hr-benefit-enrollment.hr-benefit-enrollment';
  const BONUS = 'api::pay-bonus.pay-bonus';
  const LOAN = 'api::pay-loan.pay-loan';
  const ADVANCE = 'api::pay-advance.pay-advance';
  const CLAIM = 'api::hr-expense-claim.hr-expense-claim';
  const ASSET = 'api::hr-asset.hr-asset';
  const ASSET_ASSIGN = 'api::hr-asset-assignment.hr-asset-assignment';
  const PR = 'api::pay-payroll-run.pay-payroll-run';
  const PS = 'api::pay-payslip.pay-payslip';
  const RM = 'api::pay-statutory-remittance.pay-statutory-remittance';

  // /hr-emergency-contacts/mine, /hr-bank-accounts/mine, etc. — literal path
  // must beat the seeded table's :documentId pattern, same as every other
  // custom action here.
  const selfOwnedRoutes = SELF_OWNED_ENTITIES.flatMap((name) => {
    const plural = `${name}s`; // none of these names end in "y" — plain "+s" is exact
    const uid = `api::${name}.${name}`;
    const c = selfOwned[name];
    return [
      { method: 'get', path: `/api/${plural}/mine`, uid, action: 'myList', handler: (ctx) => c.myList(ctx) },
      { method: 'post', path: `/api/${plural}/mine`, uid, action: 'myCreate', handler: (ctx) => c.myCreate(ctx) },
      { method: 'put', path: `/api/${plural}/mine/:documentId`, uid, action: 'myUpdate', handler: (ctx) => c.myUpdate(ctx) },
      { method: 'delete', path: `/api/${plural}/mine/:documentId`, uid, action: 'myDelete', handler: (ctx) => c.myDelete(ctx) },
    ];
  });

  const routes = [
    { method: 'get', path: '/api/hr-employees/me', uid: EMP, action: 'myProfile', handler: (c) => employee.myProfile(c) },
    { method: 'put', path: '/api/hr-employees/me', uid: EMP, action: 'updateMyProfile', handler: (c) => employee.updateMyProfile(c) },

    { method: 'get', path: '/api/hr-attendances/my-attendance', uid: ATT, action: 'myAttendance', handler: (c) => attendance.myAttendance(c) },
    { method: 'get', path: '/api/hr-attendances/team-attendance', uid: ATT, action: 'teamAttendance', handler: (c) => attendance.teamAttendance(c) },

    { method: 'get', path: '/api/hr-lifecycle-events/mine', uid: LE, action: 'myTimeline', handler: (c) => lifecycleEvent.myTimeline(c) },
    // Core-action override: owners mirroring on create.
    { method: 'post', path: '/api/hr-lifecycle-events', uid: LE, action: 'create', handler: (c) => lifecycleEvent.create(c) },

    { method: 'get', path: '/api/hr-leave-requests/my-balances', uid: LR, action: 'myBalances', handler: (c) => leave.myBalances(c) },
    { method: 'get', path: '/api/hr-rosters/mine', uid: ROSTER, action: 'myRoster', handler: (c) => roster.myRoster(c) },

    { method: 'get', path: '/api/hr-benefit-enrollments/mine', uid: ENROLL, action: 'myEnrollments', handler: (c) => benefitEnrollment.myEnrollments(c) },

    { method: 'get', path: '/api/pay-bonuses/mine', uid: BONUS, action: 'myBonuses', handler: (c) => bonus.myBonuses(c) },
    { method: 'get', path: '/api/pay-bonuses/team', uid: BONUS, action: 'teamBonuses', handler: (c) => bonus.teamBonuses(c) },

    { method: 'get', path: '/api/pay-loans/mine', uid: LOAN, action: 'myLoans', handler: (c) => loan.myLoans(c) },
    { method: 'post', path: '/api/pay-loans/request', uid: LOAN, action: 'requestLoan', handler: (c) => loan.requestLoan(c) },
    { method: 'get', path: '/api/pay-loans/team', uid: LOAN, action: 'teamLoans', handler: (c) => loan.teamLoans(c) },
    { method: 'post', path: '/api/pay-loans/:documentId/approve', uid: LOAN, action: 'approve', handler: (c) => loan.approve(c) },
    { method: 'post', path: '/api/pay-loans/:documentId/reject', uid: LOAN, action: 'reject', handler: (c) => loan.reject(c) },

    { method: 'get', path: '/api/pay-advances/mine', uid: ADVANCE, action: 'myAdvances', handler: (c) => advance.myAdvances(c) },
    { method: 'post', path: '/api/pay-advances/request', uid: ADVANCE, action: 'requestAdvance', handler: (c) => advance.requestAdvance(c) },
    { method: 'get', path: '/api/pay-advances/team', uid: ADVANCE, action: 'teamAdvances', handler: (c) => advance.teamAdvances(c) },
    { method: 'post', path: '/api/pay-advances/:documentId/approve', uid: ADVANCE, action: 'approve', handler: (c) => advance.approve(c) },
    { method: 'post', path: '/api/pay-advances/:documentId/reject', uid: ADVANCE, action: 'reject', handler: (c) => advance.reject(c) },

    { method: 'get', path: '/api/hr-expense-claims/mine', uid: CLAIM, action: 'myClaims', handler: (c) => expenseClaim.myClaims(c) },
    { method: 'post', path: '/api/hr-expense-claims/submit', uid: CLAIM, action: 'submitClaim', handler: (c) => expenseClaim.submitClaim(c) },
    { method: 'get', path: '/api/hr-expense-claims/team', uid: CLAIM, action: 'teamClaims', handler: (c) => expenseClaim.teamClaims(c) },
    { method: 'post', path: '/api/hr-expense-claims/:documentId/approve', uid: CLAIM, action: 'approve', handler: (c) => expenseClaim.approve(c) },
    { method: 'post', path: '/api/hr-expense-claims/:documentId/reject', uid: CLAIM, action: 'reject', handler: (c) => expenseClaim.reject(c) },
    { method: 'post', path: '/api/hr-expense-claims/:documentId/reimburse', uid: CLAIM, action: 'reimburse', handler: (c) => expenseClaim.reimburse(c) },

    { method: 'post', path: '/api/hr-assets/:documentId/assign', uid: ASSET, action: 'assign', handler: (c) => asset.assign(c) },

    { method: 'get', path: '/api/hr-asset-assignments/mine', uid: ASSET_ASSIGN, action: 'myAssignments', handler: (c) => assetAssignment.myAssignments(c) },
    { method: 'post', path: '/api/hr-asset-assignments/:documentId/return', uid: ASSET_ASSIGN, action: 'returnAsset', handler: (c) => assetAssignment.returnAsset(c) },

    ...selfOwnedRoutes,

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
    { method: 'get', path: '/api/pay-payslips/team-payslips', uid: PS, action: 'teamPayslips', handler: (c) => payslip.teamPayslips(c) },
    { method: 'post', path: '/api/pay-payslips/:documentId/mark-paid', uid: PS, action: 'markPaid', handler: (c) => payslip.markPaid(c) },

    { method: 'post', path: '/api/pay-statutory-remittances/:documentId/process', uid: RM, action: 'process', handler: (c) => remittance.process(c) },

    // Core-action override: author stamping + audit-trail mirror.
    { method: 'post', path: '/api/work-item-comments', uid: 'api::work-item-comment.work-item-comment', action: 'create', handler: (c) => comment.create(c) },

    // auth:false + ensureUser in Strapi → selfAuth here.
    { method: 'post', path: '/api/work-item-activities/assign', selfAuth: true, handler: (c) => activity.assign(c) },
    { method: 'post', path: '/api/work-item-watches/toggle', selfAuth: true, handler: (c) => watch.toggle(c) },
  ].map((r) => ({ ...r, module: 'hr' }));

  return { name: 'hr', routes };
}

module.exports = { registerHrModule };
