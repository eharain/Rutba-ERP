import { authApi } from '../lib/api.js';

export const PaySalaryStructuresEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/pay-salary-structures',
        params: {
            sort: sort ?? ['name:asc'],
        },
    }),

    fetchList: (opts = {}) => {
        const ep = PaySalaryStructuresEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
};
