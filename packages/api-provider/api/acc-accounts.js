/**
 * AccAccountsEndpoints
 * Pure endpoint descriptors for the /acc-accounts resource.
 * All methods return { path, params?, data? } objects.
 * Transport execution happens via createClientProxy in /endpoints/acc-accounts.js.
 */
export const AccAccountsEndpoints = {

    meta: {
        uid: 'api::acc-account.acc-account',
        domains: ['accounting', 'finance'],
        roles: ['admin', 'manager', 'accountant']
    },

    /**
     * List all accounting accounts.
     * @param {{ sort?, populate?, pagination? }} opts
     */
    list: ({ sort, populate, pagination } = {}) => ({
        path: '/acc-accounts',
        action: 'find',
        method: 'get',
        params: {
            sort: sort ?? ['code:asc'],
            ...(populate ? { populate } : {}),
            ...(pagination ? { pagination } : {}),
        },
    }),

    /**
     * Get account by documentId.
     * @param {string} documentId
     * @param {{ populate? }} opts
     */
    byId: (documentId, { populate } = {}) => ({
        path: `/acc-accounts/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: {
            ...(populate ? { populate } : {}),
        },
    }),

    /**
     * Create a new account.
     */
    create: (data) => ({
        path: '/acc-accounts',
        action: 'create',
        method: 'post',
    }),

    /**
     * Update an account by documentId.
     * @param {string} documentId
     */
    update: (documentId, data) => ({
        path: `/acc-accounts/${documentId}`,
        action: 'update',
        method: 'put',
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