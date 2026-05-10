export const HrTeamsEndpoints = {
    list: ({ sort, populate } = {}) => ({
        path: '/hr-teams',
        params: {
            sort: sort ?? ['name:asc'],
            ...(populate ? { populate } : {}),
        },
    }),

    appRoleOptions: () => ({ path: '/hr-teams/app-role-options' }),
    create: (data) => ({ path: '/hr-teams' , data }),
    update: (documentId, data) => ({ path: `/hr-teams/${documentId}` , data }),

};