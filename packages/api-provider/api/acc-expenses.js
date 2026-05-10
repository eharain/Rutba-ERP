export const AccExpensesEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/acc-expenses',
        params: {
            sort: sort ?? ['date:desc'],
        },
    }),
};