export const HrTeamsEndpoints = {
    list: ({ sort, populate } = {}) => ({
        path: '/hr-teams',
        params: {
            sort: sort ?? ['name:asc'],
            ...(populate ? { populate } : {}),
        },
    }),

    appRoleOptions: () => ({ path: '/hr-teams/app-role-options' }),
    create: () => ({ path: '/hr-teams' }),
    update: (documentId) => ({ path: `/hr-teams/${documentId}` }),

    fetchList: (opts = {}) => {
        const ep = HrTeamsEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    fetchAppRoleOptions: () => {
        const ep = HrTeamsEndpoints.appRoleOptions();
        return authApi.fetch(ep.path, ep.params);
    },

    postCreate: (data) => authApi.post('/hr-teams', { data }),
    putUpdate: (documentId, data) => authApi.put(`/hr-teams/${documentId}`, { data }),
};