export const HrDepartmentsEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/hr-departments',
        params: {
            sort: sort ?? ['name:asc'],
        },
    }),

};