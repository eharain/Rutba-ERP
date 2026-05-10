export const CrmActivitiesEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/crm-activities',
        params: {
            sort: sort ?? ['date:desc'],
        },
    }),

};