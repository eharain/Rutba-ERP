export const HrAttendancesEndpoints = {
    list: ({ sort, populate } = {}) => ({
        path: '/hr-attendances',
        params: {
            sort: sort ?? ['date:desc'],
            populate: populate ?? 'employee',
        },
    }),

};