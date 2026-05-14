import { listParams } from './__param_builders.js';

export const AccExpensesEndpoints = {
    meta: { domains: ['accounts'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/acc-expenses',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['date:desc'] },
        ),
    }),
};