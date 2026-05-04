import { authApi } from '../api.js';
import { buildEndpointMeta } from './access-metadata.js';

/**
 * CashRegisterTransactionEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 */
export const CashRegisterTransactionEndpoints = {

    /** Create a new cash register transaction — body provided by caller as { data }. */
    create: () => ({ path: '/cash-register-transactions' }),

    /**
     * List transactions for a specific cash register.
     * @param {string} registerDocumentId
     * @param {{ page?, pageSize?, sort? }} opts
     */
    byRegister: (registerDocumentId, { page = 1, pageSize = 500, sort } = {}) => ({
        path: '/cash-register-transactions',
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

export const CashRegisterTransactionEndpointsMeta = buildEndpointMeta('api::cash-register-transaction.cash-register-transaction', '/cash-register-transactions', {
    create: 'create',
    byRegister: 'find',
});

