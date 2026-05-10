/**
 * CashRegisterTransactionEndpoints
 * Pure endpoint descriptors for the /cash-register-transactions resource.
 */
export const CashRegisterTransactionEndpoints = {

    /** Create a new cash register transaction. */
    create: (data) => ({
        path: '/cash-register-transactions',
        action: 'create',
        method: 'post',
        apps: ['sale'],
        approle: ['admin', 'user'],
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
        approle: ['admin', 'user'],
        params: {
            filters: { cash_register: { documentId: { $eq: registerDocumentId } } },
            sort: sort ?? ['transaction_date:asc'],
            pagination: { page, pageSize },
        },
    }),

};