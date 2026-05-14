import { listParams } from './__param_builders.js';

export const AccInvoicesEndpoints = {
    meta: { domains: ['accounts'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/acc-invoices',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['date:desc'] },
        ),
    }),
};