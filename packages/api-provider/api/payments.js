/**
 * PaymentsEndpoints
 * Pure endpoint descriptors for the /payments resource.
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

    /** Create a new payment. */
    create: (data) => ({ path: '/payments', action: 'create', method: 'post', data , data }),

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

    /** Update a payment by documentId. */
    update: (documentId, data) => ({ path: `/payments/${documentId}`, action: 'update', method: 'put', data , data }),

    /**
     * Create a refund payment — body provided by caller as { data }.
     * Refunds are regular payment records with a negative amount and type 'refund'.
     */
    createRefund: () => ({ path: '/payments' }),
/** Async: fetch a single payment by documentId. */
/** Async: update a payment by documentId. */
};

/**
 * PaymentsEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const PaymentsEndpointRules = {
    /**
     * GET /api/payments — byRegister
     * Client passes: ?registerId=<documentId>
     * Server injects: filter and default sort
     */
    byRegister: {
        filters: {
            cash_register: { documentId: { $eq: '$query.registerId' } },
        },
        injectSort: ['payment_date:asc'],
    },

    /**
     * GET /api/payments/:id — byId with standard populate
     */
    byId: {
        injectPopulate: {
            sales: true,
            customer: true,
            cash_register: true,
        },
    },

    /** POST /api/payments — create */
    create: {},

    /** POST /api/payments — createRefund (same route, different semantic) */
    createRefund: {},

    /** PUT /api/payments/:id — update */
    update: {},
};