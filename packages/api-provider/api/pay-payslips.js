export const PayPayslipsEndpoints = {
    list: ({ sort, populate } = {}) => ({
        path: '/pay-payslips',
        params: {
            sort: sort ?? ['createdAt:desc'],
            populate: populate ?? ['employee'],
        },
    }),

};