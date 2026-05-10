export const CrmContactsEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/crm-contacts',
        params: {
            sort: sort ?? ['createdAt:desc'],
        },
    }),

    byId: (documentId, params = {}) => ({
        path: `/crm-contacts/${documentId}`,
        params,
    }),

};