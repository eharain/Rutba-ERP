import { listParams } from './__param_builders.js';

export const SocialAccountsEndpoints = {
    meta: { domains: ['social'] },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/social-accounts',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['createdAt:desc'] },
        ),
    }),
    create: (data) => ({ path: '/social-accounts', action: 'create', method: 'post', data }),
    update: (documentId, data) => ({ path: `/social-accounts/${documentId}`, action: 'update', method: 'put', data }),
    del: (documentId) => ({ path: `/social-accounts/${documentId}`, action: 'delete', method: 'delete' }),

};