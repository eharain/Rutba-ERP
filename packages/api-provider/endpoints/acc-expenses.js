import { authApi } from '../lib/api.js';

export const AccExpensesEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/acc-expenses',
        params: {
            sort: sort ?? ['date:desc'],
        },
    }),

    fetchList: (opts = {}) => {
        const ep = AccExpensesEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
};
