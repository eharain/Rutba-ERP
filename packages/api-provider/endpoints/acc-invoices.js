import { authApi } from '../lib/api.js';

export const AccInvoicesEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/acc-invoices',
        params: {
            sort: sort ?? ['date:desc'],
        },
    }),

    fetchList: (opts = {}) => {
        const ep = AccInvoicesEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
};
