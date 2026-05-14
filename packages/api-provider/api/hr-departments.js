import { listParams } from './__param_builders.js';

export const HrDepartmentsEndpoints = {
    meta: { domains: ['hr'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/hr-departments',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'] },
        ),
    }),
};