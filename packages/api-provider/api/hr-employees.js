export const HrEmployeesEndpoints = {
    list: ({ sort, populate } = {}) => ({
        path: '/hr-employees',
        params: {
            sort: sort ?? ['name:asc'],
            ...(populate ? { populate } : {}),
        },
    }),

    byId: (documentId, params = {}) => ({
        path: `/hr-employees/${documentId}`,
        params,
    }),

    create: () => ({ path: '/hr-employees' }),
    update: (documentId) => ({ path: `/hr-employees/${documentId}` }),

    fetchList: (opts = {}) => {
        const ep = HrEmployeesEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    fetchById: (documentId, params = {}) => {
        const ep = HrEmployeesEndpoints.byId(documentId, params);
        return authApi.fetch(ep.path, ep.params);
    },

    postCreate: (data) => authApi.post('/hr-employees', { data }),
    putUpdate: (documentId, data) => authApi.put(`/hr-employees/${documentId}`, { data }),
};