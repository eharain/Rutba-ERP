import { authApi } from '../api.js';

/**
 * SalesEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 */
export const SalesEndpoints = {

    /**
     * List sales with optional sort / filters / populate overrides.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, filters?, populate? }} opts
     */
    list: (page = 1, pageSize = 200, { sort, filters, populate } = {}) => ({
        path: '/sales',
        params: {
            sort: sort ?? ['createdAt:desc'],
            filters: filters ?? undefined,
            pagination: { page, pageSize },
            populate: populate ?? { customer: true, employee: true, cash_register: true },
        },
    }),

    /**
     * Fetch a single sale by documentId / id / invoice_no with full detail populate.
     * @param {string|number} idOrInvoice
     */
    byId: (idOrInvoice) => ({
        path: '/sales/',
        params: {
            filters: {
                $or: [
                    { invoice_no: idOrInvoice },
                    { id: idOrInvoice },
                    { documentId: idOrInvoice },
                ],
            },
            populate: {
                payments: true,
                customer: true,
                cash_register: {
                    fields: ['id', 'documentId', 'desk_id', 'desk_name', 'branch_name', 'opened_by', 'opened_at', 'status'],
                },
                items: { populate: { product: true, items: { populate: ['product'] } } },
                sale_returns: {
                    populate: {
                        items: { populate: { product: true, items: { populate: ['product'] } } },
                        exchange_sale: { fields: ['id', 'documentId', 'invoice_no'] },
                    },
                },
                exchange_returns: {
                    populate: {
                        items: { populate: { product: true, items: { populate: ['product'] } } },
                        sale: { fields: ['id', 'documentId', 'invoice_no'] },
                    },
                },
            },
        },
    }),

    /**
     * Fallback query for exchange returns linked to a sale.
     * @param {string} saleDocId
     */
    exchangeReturns: (saleDocId) => ({
        path: '/sale-returns/',
        params: {
            filters: {
                type: { $eq: 'Exchange' },
                exchange_sale: saleDocId,
            },
            populate: { items: { populate: ['product'] }, sale: true },
        },
    }),

    /** Create a new sale — body is provided by the caller as { data }. */
    create: () => ({ path: '/sales' }),

    /**
     * Update a sale by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({ path: `/sales/${documentId}` }),

    /**
     * Cancel a sale.
     * @param {string} documentId
     */
    cancel: (documentId) => ({ path: `/sales/${documentId}/cancel` }),

    /**
     * Save notes on a sale — body provided by caller as { data: { notes } }.
     * @param {string} documentId
     */
    saveNotes: (documentId) => ({ path: `/sales/${documentId}` }),

    /**
     * Custom route: find sale documentIds that contain a stock item matching term.
     * @param {string} term
     */
    searchByStockItem: (term) => ({
        path: `/sales/search-by-stock-item?term=${encodeURIComponent(term)}`,
    }),

    /**
     * Custom route: find sale documentIds where an item price falls in range.
     * @param {{ min?, max? }} opts
     */
    searchByItemPrice: ({ min, max } = {}) => {
        const params = new URLSearchParams();
        if (min !== undefined && min !== '') params.set('min', min);
        if (max !== undefined && max !== '') params.set('max', max);
        const qs = params.toString();
        return { path: `/sales/search-by-item-price${qs ? '?' + qs : ''}` };
    },

    /** Async: fetch paginated list of sales. */
    fetchList: (page, pageSize, opts = {}) => {
        const ep = SalesEndpoints.list(page, pageSize, opts);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: fetch a single sale by documentId / id / invoice_no. */
    fetchById: (idOrInvoice) => {
        const ep = SalesEndpoints.byId(idOrInvoice);
        return authApi.fetch(ep.path, ep.params);
    },

    /** Async: custom route — sales containing a matching stock item. */
    fetchByStockItem: (term) => {
        const ep = SalesEndpoints.searchByStockItem(term);
        return authApi.fetch(ep.path);
    },

    /** Async: custom route — sales where an item price falls in range. */
    fetchByItemPrice: (opts = {}) => {
        const ep = SalesEndpoints.searchByItemPrice(opts);
        return authApi.fetch(ep.path);
    },

    /** Async: create a new sale. */
    postCreate: (data) => {
        const ep = SalesEndpoints.create();
        return authApi.post(ep.path, { data });
    },

    /** Async: update a sale by documentId. */
    putUpdate: (documentId, data) => {
        const ep = SalesEndpoints.update(documentId);
        return authApi.put(ep.path, { data });
    },

    /** Async: cancel a sale. */
    putCancel: (documentId) => {
        const ep = SalesEndpoints.cancel(documentId);
        return authApi.put(ep.path);
    },

    /** Async: save notes on a sale. */
    putSaveNotes: (documentId, notes) => {
        const ep = SalesEndpoints.saveNotes(documentId);
        return authApi.put(ep.path, { data: { notes: notes || '' } });
    },
};

export const SalesEndpointsMeta = {
    uid: 'api::sale.sale',
    basePath: '/sales',
    methodActions: {
        list: 'find',
        byId: 'findOne',
        create: 'create',
        update: 'update',
        cancel: 'update',
        saveNotes: 'update',
        searchByStockItem: 'find',
        searchByItemPrice: 'find',
    },
};



