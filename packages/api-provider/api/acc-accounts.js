/**
 * AccAccountsEndpoints
 * Pure endpoint descriptors for the /acc-accounts resource.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const AccAccountsEndpoints = {

    meta: {
        uid: 'api::acc-account.acc-account',
        domains: ['accounts'],
        roles: ['admin', 'manager', 'accountant']
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/acc-accounts',
        action: 'find',
        method: 'get',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['code:asc'] },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/acc-accounts/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: byIdParams({ populate, fields }),
    }),

    /**
     * Create a new account.
     */
    create: (data) => ({
        path: '/acc-accounts',
        action: 'create',
        method: 'post',
        data,
    }),

    /**
     * Update an account by documentId.
     * @param {string} documentId
     */
    update: (documentId, data) => ({
        path: `/acc-accounts/${documentId}`,
        action: 'update',
        method: 'put',
        data,
    }),

    /**
     * Delete an account by documentId.
     * @param {string} documentId
     */
    del: (documentId) => ({
        path: `/acc-accounts/${documentId}`,
        action: 'delete',
        method: 'delete',
    }),
};