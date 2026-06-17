import { listParams, byIdParams } from './__param_builders.js';

/**
 * HrLeaveRequestsEndpoints — employee leave / time-off.
 *
 * Two role axes (no invented mechanism — standard domain+level roles):
 *   • ess_employee (ess domain, level user)  → self-service: apply / view-own / cancel-own.
 *   • ess_manager  (ess domain, level manager) → line manager: approve/reject/queue for
 *     their reports (scoped server-side by the hr-team `team_manager` graph).
 *   • hr_staff / hr_manager / hr_admin (hr domain) → HR department: hr_manager+ approve
 *     org-wide; hr_staff handles master data.
 *
 * Endpoints carry apps ['hr','ess'] where both surfaces use them; the controller
 * enforces ownership (self) and the report-scope (line manager) — api-pro only
 * gates the coarse capability.
 */
export const HrLeaveRequestsEndpoints = {
    meta: {
        uid: 'api::hr-leave-request.hr-leave-request',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    // HR-wide read of all requests (HR department only).
    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-leave-requests',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'], populate: ['employee'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/hr-leave-requests/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }, { populate: ['employee', 'decided_by'] }),
    }),

    /** Current user's own requests (any employee — self-service). */
    listMyRequests: () => ({
        path: '/hr-leave-requests/my-requests',
        action: 'myRequests',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    /** Pending requests the caller may decide (HR manager org-wide / line manager → reports). */
    listTeamQueue: () => ({
        path: '/hr-leave-requests/team-queue',
        action: 'teamQueue',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager'],
    }),

    /** Apply for leave (self-service defaults the employee to the caller). */
    create: (data) => ({
        path: '/hr-leave-requests',
        action: 'create',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    /** HR edit of a request. */
    update: (documentId, data) => ({
        path: `/hr-leave-requests/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Approve — HR manager (org-wide) or line manager (their reports). */
    approve: (documentId, extra = {}) => ({
        path: `/hr-leave-requests/${documentId}/approve`,
        action: 'approve',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager'],
        data: { ...extra },
    }),

    /** Reject — HR manager (org-wide) or line manager (their reports). `extra.reason` recorded. */
    reject: (documentId, extra = {}) => ({
        path: `/hr-leave-requests/${documentId}/reject`,
        action: 'reject',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager'],
        data: { ...extra },
    }),

    /** Cancel — the owning employee, the requester's line manager, or HR manager. */
    cancel: (documentId, extra = {}) => ({
        path: `/hr-leave-requests/${documentId}/cancel`,
        action: 'cancel',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data: { ...extra },
    }),
};
