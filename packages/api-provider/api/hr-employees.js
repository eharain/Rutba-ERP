import { listParams, byIdParams } from './__param_builders.js';

export const HrEmployeesEndpoints = {
    meta: {
        uid: 'api::hr-employee.hr-employee',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** The logged-in user's own employee profile (self-service). */
    getMyProfile: () => ({
        path: '/hr-employees/me',
        action: 'myProfile',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    /** Self-edit of personal/contact fields only (employment fields stay HR-only). */
    updateMyProfile: (data) => ({
        path: '/hr-employees/me',
        action: 'updateMyProfile',
        method: 'put',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    /**
     * Role-scoped HR dashboard aggregates. Open to every level — the server
     * decides the scope (HR → org-wide, line manager → reports, employee →
     * self), so the same call returns a different-sized picture per caller.
     */
    getDashboard: () => ({
        path: '/hr-employees/dashboard',
        action: 'dashboard',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    /**
     * Org chart. `view` is 'reporting' (default) or 'team' — the node shape is
     * identical, so one component renders both. Open to every level: HR gets the
     * whole org, anyone else is rooted on themselves server-side. `root` is
     * honoured for HR only.
     */
    getOrgChart: ({ view, root, depth } = {}) => ({
        path: '/hr-employees/org-chart',
        action: 'orgChart',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: {
            ...(view ? { view } : {}),
            ...(root ? { root } : {}),
            ...(depth ? { depth } : {}),
        },
    }),

    /**
     * Re-parent one employee on the reporting line (the drag-to-reparent write).
     *
     * Defaults to a dry run, which returns the authority impact — who gains it,
     * who loses it, and how many people travel with the dragged node — so the
     * confirmation can name them. Call again with `dryRun: false` to commit.
     */
    setReportingLine: (documentId, manager, dryRun = true) => ({
        path: `/hr-employees/${documentId}/reporting-line`,
        action: 'setReportingLine',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        data: { manager: manager ?? null, dry_run: dryRun ? 'true' : 'false' },
    }),

    /** Employees with no `reports_to` yet — the reporting-line backfill gap (HR only). */
    listWithoutReportingLine: () => ({
        path: '/hr-employees/without-reporting-line',
        action: 'withoutReportingLine',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager'],
    }),

    /**
     * Backfill `reports_to` from the team graph where unambiguous. Defaults to
     * a dry run.
     *
     * NOTE the exported name starts with `run`: the api-pro seeder only picks up
     * descriptor methods whose NAME matches its verb-prefix whitelist, and
     * "backfill" is not on it. A non-matching name is skipped silently, so the
     * policy row is never created and the route 403s forever. `action` below
     * still carries the real controller handler name, which is what api-pro
     * matches at request time.
     */
    runReportingLineBackfill: (dryRun = true) => ({
        path: '/hr-employees/backfill-reporting-line',
        action: 'backfillReportingLine',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager'],
        params: { dry_run: dryRun ? 'true' : 'false' },
    }),

    // Read access is shared with the apps that reference employees (assignee /
    // supervisor / worker-profile pickers); writes stay HR-only.
    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-employees',
        action: 'find',
        method: 'get',
        apps: ['hr', 'manufacturing', 'order-management'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-employees/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr', 'manufacturing', 'order-management'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }),
    }),

    create: (data) => ({
        path: '/hr-employees',
        action: 'create',
        method: 'post',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/hr-employees/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
};
