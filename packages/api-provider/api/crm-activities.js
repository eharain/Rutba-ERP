export const CrmActivitiesEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/crm-activities',
        params: {
            sort: sort ?? ['date:desc'],
        },
    }),

    fetchList: (opts = {}) => {
        const ep = CrmActivitiesEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
};