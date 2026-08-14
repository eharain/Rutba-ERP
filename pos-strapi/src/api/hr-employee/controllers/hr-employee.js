'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const {
  resolveOrCreateEmployeeForUser,
  resolveEmployeeForUser,
  isHrManager,
  managedReportDocIds,
  reportingLineDocIds,
  secondaryManagersFor,
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

// Upper bound on a walk up the reporting line. Matches the graph depth used in
// hr-access so a chain that is too deep to grant authority is also too deep to
// be reported as gaining it.
const MAX_CHAIN = 10;

/**
 * "Not an org root", spelled out rather than `{ is_org_root: { $ne: true } }`.
 *
 * `is_org_root` is a column added after these rows existed, so every pre-existing
 * employee holds NULL rather than false. `!= true` is NULL for those rows, and a
 * NULL predicate excludes — which would drop every existing employee from the
 * backfill gap and report `cutover_ready` on an org that had never been
 * backfilled at all. That is precisely the false all-clear the gate exists to
 * prevent, so the NULL case is matched explicitly.
 */
const NOT_ORG_ROOT = {
  $or: [{ is_org_root: { $null: true } }, { is_org_root: { $eq: false } }],
};

/**
 * Names of the secondary (matrix) managers attached to any node on a chain.
 * Reported alongside a re-parent so the confirmation can say "and these dotted
 * lines also reach them" rather than implying the primary chain is the whole
 * story.
 */
async function secondaryChainNames(strapi, chainDocIds) {
  const ids = [...new Set((chainDocIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const byEmployee = await secondaryManagersFor(strapi, ids);
  const names = new Set();
  for (const managers of byEmployee.values()) {
    for (const m of managers) if (m.grants_authority && m.name) names.add(m.name);
  }
  return Array.from(names);
}

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
    const secondaryByEmployee = await secondaryManagersFor(
      strapi,
      employees.map((e) => e.documentId),
    );

    if (hr) {
      const tree = buildReportingTree(employees, {
        rootDocId: ctx.query?.root || null, depth, secondaryByEmployee,
      });
      return ctx.send({ data: { view, depth, scope: 'hr', editable: true, tree } });
    }

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: { view, depth, scope: 'self', editable: false, tree: [], chain_upward: [] } });

    const tree = buildReportingTree(employees, {
      rootDocId: employee.documentId, depth, secondaryByEmployee,
    });
    const chain_upward = buildChainUpward(employees, employee.documentId, secondaryByEmployee);
    return ctx.send({ data: { view, depth, scope: 'self', editable: false, tree, chain_upward } });
  },

  /**
   * Employees with no reporting line — the backfill gap, and the gate on the
   * cutover from the union to the reporting line alone.
   *
   * TWO NUMBERS, AND ONLY ONE OF THEM IS THE GATE.
   *
   *   `uncovered` — nobody can approve for these people even today, because
   *     neither graph reaches them. Fix first; this is a live outage.
   *   `total` — everyone with a blank `reports_to`. The gate. The rest of this
   *     list is reachable ONLY because the team half of the union is still
   *     carrying them, so `uncovered === 0` says nothing about whether the
   *     cutover is safe: dropping the team half turns every `covered_by_team_
   *     manager` row into an uncovered one on the spot.
   *
   * Employees flagged `is_org_root` are excluded from both. The top of an org
   * reports to nobody, and counting them would leave the gate permanently
   * unsatisfiable — the union would then become permanent by accident rather
   * than by decision, which is the quiet failure this endpoint exists to
   * prevent. They are still reported separately so the exclusion is visible and
   * a mistaken flag is easy to spot.
   */
  async withoutReportingLine(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');
    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id },
      populate: { role: { select: ['type'] } },
    });
    if (!isHrManager(ctx, user)) return ctx.forbidden('HR access is required');

    const [rows, orgRoots] = await Promise.all([
      strapi.documents(EMP_UID).findMany({
        filters: {
          reports_to: { documentId: { $null: true } },
          status: { $ne: 'Inactive' },
          ...NOT_ORG_ROOT,
        },
        fields: ['documentId', 'name', 'email'],
        populate: { department: { fields: ['name'] } },
        pagination: { pageSize: 1000 },
      }),
      strapi.documents(EMP_UID).findMany({
        filters: { is_org_root: { $eq: true }, status: { $ne: 'Inactive' } },
        fields: ['documentId', 'name'],
        pagination: { pageSize: 100 },
      }),
    ]);

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
    return ctx.send({
      data,
      meta: {
        total: data.length,
        uncovered: data.filter((d) => !d.covered_by_team_manager).length,
        org_roots: (orgRoots || []).map((r) => r.name),
        // The one flag callers should branch on. Read `total`, not `uncovered`.
        cutover_ready: data.length === 0,
      },
    });
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

    // Org roots are excluded, not "skipped": giving the top of the org a manager
    // is exactly the wrong outcome, and listing them under `no_team` every run
    // would train HR to ignore that list.
    const candidates = await strapi.documents(EMP_UID).findMany({
      filters: {
        reports_to: { documentId: { $null: true } },
        status: { $ne: 'Inactive' },
        ...NOT_ORG_ROOT,
      },
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

  /**
   * Re-parent one employee on the reporting line — the write behind
   * drag-to-reparent in the org chart.
   *
   * This is an authorization change wearing a layout change's clothing. Moving
   * a node moves that node AND everyone under it, and `reports_to` is what
   * grants approval rights over leave, payslips, expenses and appraisals. So it
   * defaults to `dry_run` and returns exactly who gains and who loses that
   * authority, in names — the UI's confirmation is required to render those
   * names rather than ask "are you sure?" over a generic message.
   *
   * `manager: null` detaches (used to promote someone to the top). It is
   * accepted, but it puts the employee straight into the without-reporting-line
   * gap unless they are also flagged `is_org_root`, and the response says so.
   */
  async setReportingLine(ctx) {
    const id = ctx.state?.user?.id;
    if (!id) return ctx.unauthorized('You must be logged in');
    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id },
      populate: { role: { select: ['type'] } },
    });
    if (!isHrManager(ctx, user)) return ctx.forbidden('HR access is required to change reporting lines');

    const employeeDocId = ctx.params?.id;
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const dryRun = String(body.dry_run ?? ctx.query?.dry_run ?? 'true') !== 'false';
    const newManagerDocId = body.manager ?? body.reports_to ?? null;

    if (employeeDocId && newManagerDocId === employeeDocId) {
      return ctx.badRequest('An employee cannot report to themselves');
    }

    const employees = await loadEmployees(strapi);
    const byId = new Map(employees.map((e) => [e.documentId, e]));

    const employee = byId.get(employeeDocId);
    if (!employee) return ctx.notFound('Employee not found');
    if (newManagerDocId && !byId.has(newManagerDocId)) return ctx.notFound('Manager not found');

    // Walk up from a node, following the primary line, with a cycle guard.
    const ancestorsOf = (docId) => {
      const out = [];
      const seen = new Set([docId]);
      let cur = byId.get(docId);
      while (cur?.reports_to?.documentId && out.length < MAX_CHAIN) {
        const next = byId.get(cur.reports_to.documentId);
        if (!next || seen.has(next.documentId)) break;
        seen.add(next.documentId);
        out.push(next);
        cur = next;
      }
      return out;
    };

    // The subtree that travels with the employee — the whole point of the
    // confirmation. Dragging a director moves their department, not one person.
    const moving = await reportingLineDocIds(strapi, employeeDocId);
    const movingNames = [employee.name, ...moving.map((d) => byId.get(d)?.name).filter(Boolean)];

    // Re-parenting under your own descendant would detach the subtree from the
    // org into a free-floating ring. The cycle guards elsewhere stop it hanging
    // a request; they do not make the result meaningful.
    if (newManagerDocId && moving.includes(newManagerDocId)) {
      return ctx.badRequest(
        `${byId.get(newManagerDocId)?.name || 'That employee'} currently reports up through ` +
        `${employee.name}. Moving ${employee.name} under them would create a reporting loop.`,
      );
    }

    const oldManager = employee.reports_to?.documentId ? byId.get(employee.reports_to.documentId) : null;
    const newManager = newManagerDocId ? byId.get(newManagerDocId) : null;

    const before = oldManager ? [oldManager, ...ancestorsOf(oldManager.documentId)] : [];
    const after = newManager ? [newManager, ...ancestorsOf(newManager.documentId)] : [];
    const beforeIds = new Set(before.map((e) => e.documentId));
    const afterIds = new Set(after.map((e) => e.documentId));

    // Shared ancestors keep what they had — only the divergent part of the two
    // chains actually changes hands.
    const gains = after.filter((e) => !beforeIds.has(e.documentId)).map((e) => e.name);
    const loses = before.filter((e) => !afterIds.has(e.documentId)).map((e) => e.name);

    const impact = {
      employee: employee.name,
      from_manager: oldManager?.name || null,
      to_manager: newManager?.name || null,
      moves_with_them: movingNames.length,
      moves_with_them_names: movingNames,
      gains_authority: gains,
      loses_authority: loses,
      // Named so the caller cannot mistake the scope of what was computed: the
      // primary chain. An active secondary line pointing into either chain also
      // reaches this subtree, and is listed rather than silently folded in.
      via_secondary_lines: await secondaryChainNames(strapi, [...beforeIds, ...afterIds]),
      detaches_from_org: !newManager && employee.is_org_root !== true,
    };

    if (dryRun) return ctx.send({ data: { dry_run: true, applied: false, impact } });

    await strapi.documents(EMP_UID).update({
      documentId: employeeDocId,
      data: { reports_to: newManagerDocId ? { set: [newManagerDocId] } : { set: [] } },
    });

    strapi.log.info(
      `[hr-employee] reporting line changed: ${employee.name} ` +
      `${oldManager?.name || '(none)'} -> ${newManager?.name || '(none)'} by user ${id}`,
    );

    return ctx.send({ data: { dry_run: false, applied: true, impact } });
  },
}));
