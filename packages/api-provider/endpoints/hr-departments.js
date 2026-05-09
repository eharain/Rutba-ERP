import { authApi } from '../lib/api.js';

export const HrDepartmentsEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/hr-departments',
        params: {
            sort: sort ?? ['name:asc'],
        },
    }),

    fetchList: (opts = {}) => {
        const ep = HrDepartmentsEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
};
