import { listParams } from './__param_builders.js';

export const HrAttendancesEndpoints = {
    meta: {
        uid: 'api::hr-attendance.hr-attendance',
        domains: ['hr'],
        roles: ['admin', 'manager', 'staff'],
    },

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
};
