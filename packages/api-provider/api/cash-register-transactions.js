/**
 * CashRegisterTransactionEndpoints
 * Pure endpoint descriptors for the /cash-register-transactions resource.
 */
export const CashRegisterTransactionEndpoints = {

    meta: {
        uid: 'api::cash-register-transaction.cash-register-transaction',
        domains: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        roles: ['admin', 'manager', 'staff']
    },

    /** Create a new cash register transaction. */
    create: (data) => ({
        path: '/cash-register-transactions',
        action: 'create',
        method: 'post',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    postCreate: (data) => ({
        path: '/cash-register-transactions',
        action: 'create',
        method: 'post',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * List transactions for a specific cash register.
     * @param {string} registerDocumentId
     * @param {{ page?, pageSize?, sort? }} opts
     */
    byRegister: (registerDocumentId, { page = 1, pageSize = 500, sort } = {}) => ({
        path: '/cash-register-transactions',
        action: 'find',
        method: 'get',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: { cash_register: { documentId: { $eq: registerDocumentId } } },
            sort: sort ?? ['transaction_date:asc'],
            pagination: { page, pageSize },
        },
    }),
    fetchByRegister: (registerDocumentId, { page = 1, pageSize = 500, sort, useDocumentId = true, populate } = {}) => ({
        path: '/cash-register-transactions',
        action: 'find',
        method: 'get',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: useDocumentId
                ? { cash_register: { documentId: { $eq: registerDocumentId } } }
                : { cash_register: { id: { $eq: registerDocumentId } } },
            sort: sort ?? ['transaction_date:asc'],
            pagination: { page, pageSize },
            ...(populate ? { populate } : {}),
        },
    }),

};