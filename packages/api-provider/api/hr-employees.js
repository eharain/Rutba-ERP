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
