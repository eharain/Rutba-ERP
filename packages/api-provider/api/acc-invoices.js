export const AccInvoicesEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/acc-invoices',
        params: {
            sort: sort ?? ['date:desc'],
        },
    }),

    fetchList: (sort = {}) => {
        const ep = AccInvoicesEndpoints.list(sort);
        return authApi.fetch(ep.path, ep.params);
    },
};