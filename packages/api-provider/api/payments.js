/**
 * PaymentsEndpoints
 * Pure endpoint descriptors for the /payments resource.
 */
import { listParams, byIdParams } from './__param_builders.js';

// Per-role scope shared by every policy below. Staff sees their own payments
// from the last 7 days; admin/manager unrestricted.
const ROLE_SCOPES = {
    admin: {},
    manager: {},
    staff: { scope: 'owner+recency', ownerField: 'createdBy', recencyField: 'createdAt' },
};

export const PaymentsEndpoints = {

    meta: {
        uid: 'api::payment.payment',
        domains: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        roles: ['admin', 'manager', 'staff'],
    },

    /**
     * List payments for a specific cash register.
     * @param {string|number} registerId  documentId or numeric id
     */
    byRegister: (registerId, { page, pageSize, sort, populate, filters, fields, useDocumentId = true } = {}) => ({
        path: '/payments',
        action: 'find',
        method: 'get',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            {
                sort: ['payment_date:asc'],
                pageSize: 500,
                filters: useDocumentId
                    ? { cash_register: { documentId: { $eq: registerId } } }
                    : { cash_register: { id: { $eq: registerId } } },
            },
        ),
    }),
    fetchByRegister: (registerId, opts = {}) => ({
        path: '/payments',
        action: 'find',
        method: 'get',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
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
        scope: ROLE_SCOPES,
        data,
    }),
    postCreate: (data) => ({
        path: '/payments',
        action: 'create',
        method: 'post',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /**
     * Fetch a payment by documentId.
     * @param {string} documentId
     */
    byId: (documentId, { populate, fields } = {}) => ({
        path: `/payments/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: byIdParams(
            { populate, fields },
            { populate: { sales: true, customer: true, cash_register: true } },
        ),
    }),
    fetchById: (documentId, { populate } = {}) => ({
        path: `/payments/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
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
        scope: ROLE_SCOPES,
        data,
    }),
    putUpdate: (documentId, data) => ({
        path: `/payments/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
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
        scope: ROLE_SCOPES,
    }),
    postRefund: (data) => ({
        path: '/payments',
        action: 'createRefund',
        method: 'post',
        apps: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
/** Async: fetch a single payment by documentId. */
/** Async: update a payment by documentId. */
};
