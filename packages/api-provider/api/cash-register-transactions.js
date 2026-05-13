/**
 * CashRegisterTransactionEndpoints
 * Pure endpoint descriptors for the /cash-register-transactions resource.
 */

// Per-role scope shared by every policy below. Staff sees only transactions
// they recorded in the last 7 days.
const ROLE_SCOPES = {
    admin: {},
    manager: {},
    staff: { scope: 'owner+recency', ownerField: 'createdBy', recencyField: 'createdAt' },
};

export const CashRegisterTransactionEndpoints = {

    meta: {
        uid: 'api::cash-register-transaction.cash-register-transaction',
        domains: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** Create a new cash register transaction. */
    create: (data) => ({
        path: '/cash-register-transactions',
        action: 'create',
        method: 'post',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
    postCreate: (data) => ({
        path: '/cash-register-transactions',
        action: 'create',
        method: 'post',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
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
        scope: ROLE_SCOPES,
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
        scope: ROLE_SCOPES,
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
