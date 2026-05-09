import { authApi } from '../lib/api.js';

export const AccAccountsEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/acc-accounts',
        params: {
            sort: sort ?? ['code:asc'],
        },
    }),

    fetchList: (opts = {}) => {
        const ep = AccAccountsEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
};
