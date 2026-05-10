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

    create: (data) => ({ path: '/hr-employees' , data }),
    update: (documentId, data) => ({ path: `/hr-employees/${documentId}` , data }),

};