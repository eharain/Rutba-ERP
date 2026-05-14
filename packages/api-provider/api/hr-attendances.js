import { listParams } from './__param_builders.js';

export const HrAttendancesEndpoints = {
    meta: { domains: ['hr'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-attendances',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['date:desc'], populate: 'employee' },
        ),
    }),

};