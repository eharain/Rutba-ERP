export const AccInvoicesEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/acc-invoices',
        params: {
            sort: sort ?? ['date:desc'],
        },
    }),

};