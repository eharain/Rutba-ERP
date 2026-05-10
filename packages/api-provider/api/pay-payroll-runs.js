export const PayPayrollRunsEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/pay-payroll-runs',
        params: {
            sort: sort ?? ['period_start:desc'],
        },
    }),

};