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

    fetchList: (opts = {}) => {
        const ep = CrmContactsEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },

    fetchById: (documentId, params = {}) => {
        const ep = CrmContactsEndpoints.byId(documentId, params);
        return authApi.fetch(ep.path, ep.params);
    },
};