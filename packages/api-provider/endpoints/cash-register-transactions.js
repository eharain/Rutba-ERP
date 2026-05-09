import { authApi } from '../lib/api.js';

/**
 * CashRegisterTransactionEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 */
export const CashRegisterTransactionEndpoints = {

    /** Create a new cash register transaction — body provided by caller as { data }. */
    create: () => ({ path: '/cash-register-transactions' , action:'create' , method:post, apps:['sale'], approle:['admin,user'] }),

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

    /** Async: fetch transactions for a specific cash register. */
    fetchByRegister: (registerDocumentId, opts = {}) => {
        const ep = CashRegisterTransactionEndpoints.byRegister(registerDocumentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: create a new cash register transaction. */
    postCreate: (data) => {
        const ep = CashRegisterTransactionEndpoints.create();
        return authApi.post(ep.path, { data });
    },
};

/**
 * CashRegisterTransactionEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const CashRegisterTransactionEndpointRules = {
    /**
     * GET /api/cash-register-transactions — byRegister
     * Client passes: ?registerId=<documentId>
     * Server injects: filter by cash_register relation
     */
    byRegister: {
        filters: {
            cash_register: { documentId: { $eq: '$query.registerId' } },
        },
        injectSort: ['createdAt:asc'],
    },

    /** POST /api/cash-register-transactions — create */
    create: {},
};



