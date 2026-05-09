import { authApi } from '../lib/api.js';

export const SocialAccountsEndpoints = {
    list: ({ sort } = {}) => ({
        path: '/social-accounts',
        params: { sort: sort ?? ['createdAt:desc'] },
    }),
    create: () => ({ path: '/social-accounts' }),
    update: (documentId) => ({ path: `/social-accounts/${documentId}` }),
    del: (documentId) => ({ path: `/social-accounts/${documentId}` }),

    fetchList: (opts = {}) => {
        const ep = SocialAccountsEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    postCreate: (data) => authApi.post('/social-accounts', data),
    putUpdate: (documentId, data) => authApi.put(`/social-accounts/${documentId}`, data),
    putDelete: (documentId) => authApi.del(`/social-accounts/${documentId}`),
};
