/**
 * PaymentsEndpoints
 * Pure endpoint descriptors for the /payments resource.
 */
export const PaymentsEndpoints = {

    meta: {
        uid: 'api::payment.payment',
        domains: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * List payments for a specific cash register.
     * @param {string|number} registerId  documentId or numeric id
     * @param {{ page?, pageSize?, sort?, populate? }} opts
     */
    byRegister: (registerId, { page = 1, pageSize = 500, sort, populate, useDocumentId = true } = {}) => ({
        path: '/payments',
        action: 'find',
        method: 'get',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: useDocumentId
                ? { cash_register: { documentId: { $eq: registerId } } }
                : { cash_register: { id: { $eq: registerId } } },
            sort: sort ?? ['payment_date:asc'],
            pagination: { page, pageSize },
            ...(populate ? { populate } : {}),
        },
    }),
    fetchByRegister: (registerId, opts = {}) => ({
        path: '/payments',
        action: 'find',
        method: 'get',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: (opts.useDocumentId ?? true)
                ? { cash_register: { documentId: { $eq: registerId } } }
                : { cash_register: { id: { $eq: registerId } } },
            sort: opts.sort ?? ['payment_date:asc'],
            pagination: { page: opts.page ?? 1, pageSize: opts.pageSize ?? 500 },
            ...(opts.populate ? { populate: opts.populate } : {}),
        },
    }),

    /** Create a new payment. */
    create: (data) => ({
        path: '/payments',
        action: 'create',
        method: 'post',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    postCreate: (data) => ({
        path: '/payments',
        action: 'create',
        method: 'post',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * Fetch a payment by documentId.
     * @param {string} documentId
     * @param {{ populate? }} opts
     */
    byId: (documentId, { populate } = {}) => ({
        path: `/payments/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: populate ?? { sales: true, customer: true, cash_register: true },
        },
    }),
    fetchById: (documentId, { populate } = {}) => ({
        path: `/payments/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            populate: populate ?? { sales: true, customer: true, cash_register: true },
        },
    }),

    /** Update a payment by documentId. */
    update: (documentId, data) => ({
        path: `/payments/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    putUpdate: (documentId, data) => ({
        path: `/payments/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /**
     * Create a refund payment — body provided by caller as { data }.
     * Refunds are regular payment records with a negative amount and type 'refund'.
     */
    createRefund: () => ({
        path: '/payments',
        action: 'createRefund',
        method: 'post',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
    }),
    postRefund: (data) => ({
        path: '/payments',
        action: 'createRefund',
        method: 'post',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
/** Async: fetch a single payment by documentId. */
/** Async: update a payment by documentId. */
};
