import { authApi } from '../lib/api.js';

export const PayPayrollRunsEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/pay-payroll-runs',
        params: {
            sort: sort ?? ['period_start:desc'],
        },
    }),

    fetchList: (opts = {}) => {
        const ep = PayPayrollRunsEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
};
