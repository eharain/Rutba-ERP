export const CrmActivitiesEndpoints = {
    meta: { domains: ['crm'] },

    list: ({ sort } = {}) => ({
        path: '/crm-activities',
        params: {
            sort: sort ?? ['date:desc'],
        },
    }),

};