export const HrAttendancesEndpoints = {
    list: ({ sort, populate } = {}) => ({
        path: '/hr-attendances',
        params: {
            sort: sort ?? ['date:desc'],
            populate: populate ?? 'employee',
        },
    }),

    fetchList: (opts = {}) => {
        const ep = HrAttendancesEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
};