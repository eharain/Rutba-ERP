import { listParams } from './__param_builders.js';

/**
 * HrAttendancesEndpoints — daily attendance records.
 *
 * listMyAttendance / listTeamAttendance mirror HrLeaveRequestsEndpoints' model:
 * the controller enforces ownership (self) and the report-scope (line manager)
 * — api-pro only gates the coarse capability.
 */
export const HrAttendancesEndpoints = {
    meta: {
        uid: 'api::hr-attendance.hr-attendance',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    // HR-wide read of all attendance (HR department only).
    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-attendances',
        action: 'find',
        method: 'get',
        apps: ['hr'],
        approle: ['admin', 'manager', 'staff'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['date:desc'], populate: 'employee' },
        ),
    }),

    /** Current user's own attendance history (any employee — self-service). */
    listMyAttendance: () => ({
        path: '/hr-attendances/my-attendance',
        action: 'myAttendance',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    /** Attendance for the caller's reports (HR manager org-wide / line manager -> reports). */
    listTeamAttendance: () => ({
        path: '/hr-attendances/team-attendance',
        action: 'teamAttendance',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager'],
    }),
};
