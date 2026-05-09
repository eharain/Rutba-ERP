import { authApi } from '../lib/api.js';
import { prepareForPut, getUser, generateNextPONumber } from '../utils.js';
import { dataNode } from '../pos/search.js';
import { PurchaseItemsEndpoints } from './purchase-items.js';

/**
 * PurchasesEndpoints
 * Centralised path + params definitions for the /purchases content-type.
 */
export const PurchasesEndpoints = {

    meta: {
        uid: 'api::purchase.purchase',
        domains: ['purchase', 'stock'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * List purchases with optional pagination and populate.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, filters?, populate? }} opts
     */
    list: (page = 1, pageSize = 100, { sort, filters, populate } = {}) => ({
        path: '/purchases',
        action: 'find',
        method: 'get',
        apps: ['purchase', 'stock'],
        approle: ['admin', 'manager', 'staff'],
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

    /** Async: fetch purchase list (single page). */
    fetchList: (page = 1, pageSize = 100, opts = {}) => {
        const ep = PurchasesEndpoints.list(page, pageSize, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch all purchases across pages. */
    fetchAll: (opts = {}) => {
        const ep = PurchasesEndpoints.list(1, 100, opts);
        return authApi.getAll(ep.path, ep.params);
    },

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

    /**
     * Fetch a purchase by documentId, numeric id, or PO orderId.
     * Previously standalone function, now part of the endpoint object.
     * @param {string|number} id
     */
    fetchPurchaseByIdDocumentIdOrPO: async (id) => {
        const ep = PurchasesEndpoints.byId(id);
        const res = await authApi.get(ep.path, ep.params);
        const data = dataNode(res);
        return Array.isArray(data) ? data[0] : data;
    },

    /**
     * Inline-update purchase items without creating separate PurchaseItem records.
     * Previously standalone function, now part of the endpoint object.
     * @param {string} id - documentId of the purchase
     * @param {Array} items
     */
    savePurchaseItems: async (id, items) => {
        return PurchasesEndpoints.putUpdate(id, {
            items: items.map((i) => ({
                stock_item: i.stock_item.id,
                quantity: i.quantity,
                price: i.price,
            })),
        });
    },

    /**
     * Save a full purchase record with its items, creating or updating as needed.
     * Previously standalone function, now part of the endpoint object.
     * @param {string|number} idx - unused legacy param (kept for compat)
     * @param {Object} purchase
     */
    savePurchase: async (idx, purchase) => {
        const items = purchase.items;
        const saveItems = [];
        if (!Array.isArray(purchase.suppliers)) {
            purchase.suppliers = [];
        }
        for (const item of items) {
            if (Array.isArray(item.product.suppliers)) {
                purchase.suppliers.push(...item.product.suppliers);
            }
            const savedItem = await PurchaseItemsEndpoints.savePurchaseItem(item);
            saveItems.push(savedItem);
        }
        const purchaseData = { ...purchase };
        purchaseData.items = { connect: saveItems.map((i) => i.documentId) };
        const isExisting = purchaseData.id > 0;
        if (isExisting) {
            const res = await PurchasesEndpoints.putUpdate(purchaseData.documentId, prepareForPut(purchaseData, []));
            return dataNode(res);
        } else {
            const res = await PurchasesEndpoints.postCreate(prepareForPut(purchaseData, []));
            return dataNode(res);
        }
    },

    /**
     * Fetch a paginated list of purchases.
     * Previously standalone function, now part of the endpoint object.
     * @param {number} page
     * @param {number} rowsPerPage
     */
    fetchPurchases: async (page, rowsPerPage = 100) => {
        const ep = PurchasesEndpoints.list(page, rowsPerPage);
        return await authApi.fetch(ep.path, ep.params);
    },

    /**
     * Create a new draft purchase owned by the current user.
     * Previously standalone function, now part of the endpoint object.
     * @returns {{ data, id, nameSingular, namePlural }}
     */
    createPurchase: async () => {
        const user = getUser();
        const data = {
            orderId: generateNextPONumber(),
            order_date: new Date().toISOString(),
            total: 0,
            owners: { connect: [user.documentId] },
        };
        const res = await PurchasesEndpoints.postCreate(data);
        const rdata = res?.data ?? res;
        return { data: rdata, id: rdata.documentId ?? rdata.id, nameSingular: 'purchase', namePlural: 'purchases' };
    },

    /**
     * Search purchases by supplier name/phone or order ID.
     * Previously standalone function, now part of the endpoint object.
     * @param {string} searchTerm
     * @param {number} page
     * @param {number} rowsPerPage
     */
    searchPurchases: async (searchTerm, page = 1, rowsPerPage = 5) => {
        const hasSearch = searchTerm && searchTerm.trim().length > 0;
        const query = {
            populate: {
                suppliers: true,
                receipts: true,
                gallery: true,
                items: { populate: { product: true } },
            },
            pagination: { page, pageSize: rowsPerPage },
        };
        if (hasSearch) {
            query.filters = {
                $or: [
                    { suppliers: { $or: [{ name: { $containsi: searchTerm } }, { phone: { $containsi: searchTerm } }] } },
                    { orderId: { $eq: searchTerm } },
                ],
            };
        }
        const qs = (await import('qs')).default;
        const res = await authApi.fetch(`/purchases?${qs.stringify(query, { encodeValuesOnly: true })}`);
        return dataNode(res);
    },
};

/**
 * PurchasesEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const PurchasesEndpointRules = {
    /** GET /api/purchases — paginated list with supplier populate */
    list: {
        injectPopulate: {
            suppliers: true,
        },
    },

    /**
     * GET /api/purchases — byId
     * Client passes: ?q=<orderId|id|documentId>
     * Server injects: $or filter + full populate
     */
    byId: {
        filters: {
            $or: [
                { orderId: '$query.q' },
                { id: '$query.q' },
                { documentId: '$query.q' },
            ],
        },
        injectPopulate: {
            suppliers: true,
            receipts: true,
            gallery: true,
            items: { populate: { product: true } },
        },
    },

    /** POST /api/purchases — create, no special rules */
    create: {},

    /** PUT /api/purchases/:id — update, no special rules */
    update: {},

    /** DELETE /api/purchases/:id */
    delete: {},
};
