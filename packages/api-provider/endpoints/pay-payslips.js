import { authApi } from '../lib/api.js';

export const PayPayslipsEndpoints = {
    list: ({ sort, populate } = {}) => ({
        path: '/pay-payslips',
        params: {
            sort: sort ?? ['createdAt:desc'],
            populate: populate ?? ['employee'],
        },
    }),

    fetchList: (opts = {}) => {
        const ep = PayPayslipsEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
};
