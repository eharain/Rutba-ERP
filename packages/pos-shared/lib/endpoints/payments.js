import { authApi } from '../api.js';

/**
 * PaymentsEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 */
export const PaymentsEndpoints = {

    /**
     * List payments for a specific cash register.
     * @param {string|number} registerId  documentId or numeric id
     * @param {{ page?, pageSize?, sort?, populate? }} opts
     */
    byRegister: (registerId, { page = 1, pageSize = 500, sort, populate, useDocumentId = true } = {}) => ({
        path: '/payments',
        params: {
            filters: useDocumentId
                ? { cash_register: { documentId: { $eq: registerId } } }
                : { cash_register: { id: { $eq: registerId } } },
            sort: sort ?? ['payment_date:asc'],
            pagination: { page, pageSize },
            ...(populate ? { populate } : {}),
        },
    }),

    /** Create a new payment — body provided by caller as { data }. */
    create: () => ({ path: '/payments' }),

    /**
     * Fetch a payment by documentId.
     * @param {string} documentId
     * @param {{ populate? }} opts
     */
    byId: (documentId, { populate } = {}) => ({
        path: `/payments/${documentId}`,
        params: {
            populate: populate ?? { sales: true, customer: true, cash_register: true },
        },
    }),

    /**
     * Update a payment by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/payments/${documentId}` }),

    /**
     * Create a refund payment — body provided by caller as { data }.
     * Refunds are regular payment records with a negative amount and type 'refund'.
     */
    createRefund: () => ({ path: '/payments' }),

    /** Async: fetch payments for a specific cash register. */
    fetchByRegister: (registerId, opts = {}) => {
        const ep = PaymentsEndpoints.byRegister(registerId, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch a single payment by documentId. */
    fetchById: (documentId, opts = {}) => {
        const ep = PaymentsEndpoints.byId(documentId, opts);
        return authApi.fetch(ep.path, ep.params);
    },
};
