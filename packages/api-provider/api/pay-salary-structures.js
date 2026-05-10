export const PaySalaryStructuresEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/pay-salary-structures',
        params: {
            sort: sort ?? ['name:asc'],
        },
    }),

};