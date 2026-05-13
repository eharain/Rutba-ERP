import { listParams } from './__param_builders.js';

export const PaySalaryStructuresEndpoints = {
    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/pay-salary-structures',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'] },
        ),
    }),

};