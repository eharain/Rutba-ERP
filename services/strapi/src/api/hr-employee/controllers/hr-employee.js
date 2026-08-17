'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const {
  resolveOrCreateEmployeeForUser,
  resolveEmployeeForUser,
  isHrManager,
  managedReportDocIds,
} = require('../../../utils/hr-access');
const { buildDashboard, headcountByDepartment } = require('../../../utils/hr-analytics');
const {
  loadEmployees,
  buildReportingTree,
  buildTeamTree,
  buildChainUpward,
  clampDepth,
} = require('../../../utils/hr-org-chart');

const EMP_UID = 'api::hr-employee.hr-employee';
const TEAM_UID = 'api::hr-team.hr-team';

const PROFILE_FIELDS = [
  'name', 'email', 'phone', 'designation', 'date_of_joining', 'status', 'address',
  'cnic', 'passport_number', 'nationality', 'religion', 'gender', 'date_of_birth',
  'marital_status', 'blood_group',
];

// Personal/contact fields the employee may edit themselves. Employment fields
// (name, designation, date_of_joining, status, department, position, company,
// salary_structure, reports_to, user) stay HR-controlled.
const SELF_EDITABLE_FIELDS = [
  'phone', 'address', 'cnic', 'passport_number', 'nationality', 'religion',
  'gender', 'date_of_birth', 'marital_status', 'blood_group',
];

module.exports = createCoreController(EMP_UID, ({ strapi }) => ({
  /** The caller's own profile (self-service; excludes payroll-sensitive fields). */
  async myProfile(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');

    const user = await strapi.query('plugin::users-permissions.user').findOne({ where: { id } });
    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: null });

    const row = await strapi.documents(EMP_UID).findOne({
      documentId: employee.documentId,
      fields: PROFILE_FIELDS,
      populate: { department: { fields: ['name'] } },
    });
    return ctx.send({ data: row });
  },

  /** Self-edit of personal/contact fields only — employment fields are HR-controlled. */
  async updateMyProfile(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');

    const user = await strapi.query('plugin::users-permissions.user').findOne({ where: { id } });
    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.badRequest('No employee record for this account');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const data = {};
    for (const field of SELF_EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) data[field] = body[field];
    }

    const updated = await strapi.documents(EMP_UID).update({
      documentId: employee.documentId,
      data,
      fields: PROFILE_FIELDS,
      populate: { department: { fields: ['name'] } },
    });
    return ctx.send({ data: updated });
  },

  /**
   * Role-scoped HR dashboard. The scope is resolved once and every metric is
   * computed inside it: HR claim → org-wide (null scope), line manager → their
   * reports plus themselves, plain employee → themselves only. `by_department`
   * is omitted for a plain employee since a one-row breakdown leaks nothing
   * useful and invites confusion.
   */
  async dashboard(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');

    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id },
      populate: { role: { select: ['type'] } },
    });

    let scope = null; // null == org-wide
    let level = 'hr';
    if (!isHrManager(ctx, user)) {
      const employee = await resolveOrCreateEmployeeForUser(strapi, user);
      if (!employee) return ctx.send({ data: null });
      const reports = await managedReportDocIds(strapi, employee.documentId);
      scope = reports.length ? [...reports, employee.documentId] : [employee.documentId];
      level = reports.length ? 'manager' : 'employee';
    }

    const data = await buildDashboard(strapi, scope);
    data.scope = level;
    if (level !== 'employee') {
      data.by_department = await headcountByDepartment(strapi, scope);
    }
    return ctx.send({ data });
  },

  /**
   * Org chart. `view=reporting|team` picks which edge the server walks; the
   * node shape is identical either way so one component renders both.
   *
   * Scope: HR sees the whole org from its natural roots; anyone else is rooted
   * on themselves and additionally gets `chain_upward` (who they report to, up
   * the line) so an employee can see where they sit without seeing sideways.
   * An explicit `root` is honoured only for HR — otherwise a manager could root
   * the chart on someone else's subtree.
   */
  async orgChart(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');

    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id },
      populate: { role: { select: ['type'] } },
    });

    const view = String(ctx.query?.view || 'reporting').toLowerCase();
    if (!['reporting', 'team'].includes(view)) {
      return ctx.badRequest("view must be 'reporting' or 'team'");
    }
    const depth = clampDepth(ctx.query?.depth);
    const hr = isHrManager(ctx, user);

    if (view === 'team') {
      const rootDocId = hr ? (ctx.query?.root || null) : null;
      const tree = await buildTeamTree(strapi, { rootDocId, depth });
      return ctx.send({ data: { view, depth, scope: hr ? 'hr' : 'self', tree } });
    }

    const employees = await loadEmployees(strapi);

    if (hr) {
      const tree = buildReportingTree(employees, { rootDocId: ctx.query?.root || null, depth });
      return ctx.send({ data: { view, depth, scope: 'hr', tree } });
    }

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: { view, depth, scope: 'self', tree: [], chain_upward: [] } });

    const tree = buildReportingTree(employees, { rootDocId: employee.documentId, depth });
    const chain_upward = buildChainUpward(employees, employee.documentId);
    return ctx.send({ data: { view, depth, scope: 'self', tree, chain_upward } });
  },

  /**
   * Employees with no reporting line — the backfill gap. While
   * managedReportDocIds is the union of both graphs these people are still
   * covered by their team manager, so this is a to-do list, not an outage. It
   * has to reach empty before authority can collapse to the reporting line
   * alone (see docs/todo/hr-org-chart-and-reporting-line.md).
   */
  async withoutReportingLine(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');
    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id },
      populate: { role: { select: ['type'] } },
    });
    if (!isHrManager(ctx, user)) return ctx.forbidden('HR access is required');

    const rows = await strapi.documents(EMP_UID).findMany({
      filters: { reports_to: { documentId: { $null: true } }, status: { $ne: 'Inactive' } },
      fields: ['documentId', 'name', 'email'],
      populate: { department: { fields: ['name'] } },
      pagination: { pageSize: 1000 },
    });

    // Show whether the team graph currently covers them, so HR can see which
    // gaps are urgent (nobody can approve for them) versus merely untidy.
    const teams = await strapi.documents(TEAM_UID).findMany({
      fields: ['documentId'],
      populate: { members: { fields: ['documentId'] }, team_manager: { fields: ['documentId', 'name'] } },
      pagination: { pageSize: 1000 },
    });
    const coverage = new Map();
    for (const t of teams || []) {
      if (!t.team_manager?.documentId) continue;
      for (const m of t.members || []) {
        if (m.documentId) coverage.set(m.documentId, t.team_manager.name);
      }
    }

    const data = (rows || []).map((r) => ({
      ...r,
      covered_by_team_manager: coverage.get(r.documentId) || null,
    }));
    return ctx.send({ data, meta: { total: data.length, uncovered: data.filter((d) => !d.covered_by_team_manager).length } });
  },

  /**
   * Backfill `reports_to` from the team graph, but ONLY where it is
   * unambiguous: the employee is a member of exactly one team, that team has a
   * manager, and the manager is not the employee. Anyone in several teams is
   * left alone and reported back — guessing an approval chain is worse than
   * leaving HR to set it. Idempotent: employees who already have a reporting
   * line are skipped.
   */
  async backfillReportingLine(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');
    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id },
      populate: { role: { select: ['type'] } },
    });
    if (!isHrManager(ctx, user)) return ctx.forbidden('HR access is required');

    const dryRun = String(ctx.query?.dry_run ?? 'true') !== 'false';

    const teams = await strapi.documents(TEAM_UID).findMany({
      fields: ['documentId', 'name'],
      populate: { members: { fields: ['documentId'] }, team_manager: { fields: ['documentId', 'name'] } },
      pagination: { pageSize: 1000 },
    });

    const managersFor = new Map(); // employeeDocId -> Set(managerDocId)
    for (const t of teams || []) {
      const mgr = t.team_manager?.documentId;
      if (!mgr) continue;
      for (const m of t.members || []) {
        if (!m.documentId || m.documentId === mgr) continue;
        if (!managersFor.has(m.documentId)) managersFor.set(m.documentId, new Set());
        managersFor.get(m.documentId).add(mgr);
      }
    }

    const candidates = await strapi.documents(EMP_UID).findMany({
      filters: { reports_to: { documentId: { $null: true } }, status: { $ne: 'Inactive' } },
      fields: ['documentId', 'name'],
      pagination: { pageSize: 1000 },
    });

    const applied = [];
    const ambiguous = [];
    const noTeam = [];
    for (const emp of candidates || []) {
      const mgrs = managersFor.get(emp.documentId);
      if (!mgrs || mgrs.size === 0) { noTeam.push(emp.name); continue; }
      if (mgrs.size > 1) { ambiguous.push(emp.name); continue; }
      const managerDocId = Array.from(mgrs)[0];
      if (!dryRun) {
        // documents().update needs an explicit connect verb for relations
        await strapi.documents(EMP_UID).update({
          documentId: emp.documentId,
          data: { reports_to: { connect: [managerDocId] } },
        });
      }
      applied.push(emp.name);
    }

    return ctx.send({
      data: {
        dry_run: dryRun,
        applied: applied.length,
        applied_names: applied,
        ambiguous_multi_team: ambiguous,
        no_team: noTeam,
      },
    });
  },
}));
