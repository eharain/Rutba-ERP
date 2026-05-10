export const SocialAccountsEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/social-accounts',
        params: { sort: sort ?? ['createdAt:desc'] },
    }),
    create: (data) => ({ path: '/social-accounts', action: 'create', method: 'post', data , data }),
    update: (documentId, data) => ({ path: `/social-accounts/${documentId}`, action: 'update', method: 'put', data , data }),
    del: (documentId) => ({ path: `/social-accounts/${documentId}`, action: 'delete', method: 'delete' }),

};