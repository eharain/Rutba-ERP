import { authApi } from '../api.js';

/**
 * PurchasesEndpoints
 * Centralised path + params definitions for the /purchases content-type.
 */
export const PurchasesEndpoints = {

    /**
     * List purchases with optional pagination and populate.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, filters?, populate? }} opts
     */
    list: (page = 1, pageSize = 100, { sort, filters, populate } = {}) => ({
        path: '/purchases',
        params: {
            sort: sort ?? ['createdAt:desc'],
            filters: filters ?? undefined,
            pagination: { page, pageSize },
            populate: populate ?? { suppliers: true },
        },
    }),

    /**
     * Fetch a single purchase by documentId / id / orderId with full detail populate.
     * Used by fetchPurchaseByIdDocumentIdOrPO — urlAndRelations previously built this as a qs string.
     * @param {string|number} idOrOrderId
     */
    byId: (idOrOrderId) => ({
        path: '/purchases/',
        params: {
            filters: {
                $or: [
                    { orderId: idOrOrderId },
                    { id: idOrOrderId },
                    { documentId: idOrOrderId },
                ],
            },
            populate: {
                suppliers: true,
                receipts: true,
                gallery: true,
                items: {
                    populate: { product: true },
                },
            },
        },
    }),

    /** Create a new purchase — body provided by caller as { data }. */
    create: () => ({ path: '/purchases' }),

    /**
     * Update a purchase by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/purchases/${documentId}` }),

    /** Async: create a new purchase. */
    postCreate: (data) => authApi.post('/purchases', { data }),

    /** Async: update a purchase by documentId. */
    putUpdate: (documentId, data) => authApi.put(`/purchases/${documentId}`, { data }),

    /** Async: delete a purchase by documentId. */
    putDelete: (documentId) => authApi.del(`/purchases/${documentId}`),
};
