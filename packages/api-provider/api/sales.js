import { dataNode } from '../pos/search.js';
import { generateNextInvoiceNumber, getUser } from '../utils.js';

/**
 * SalesEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 */
export const SalesEndpoints = {

    /** Resource metadata for policy generation */
    meta: {
        uid: 'api::sale.sale',
        domains: ['sale'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * List sales with optional sort / filters / populate overrides.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, filters?, populate? }} opts
     */
    list: (page = 1, pageSize = 200, { sort, filters, populate } = {}) => ({
        path: '/sales',
        action: 'find',
        method: 'get',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff'],
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
        action: 'findOne',
        method: 'get',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff'],
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
        action: 'find',
        method: 'get',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: {
                type: { $eq: 'Exchange' },
                exchange_sale: saleDocId,
            },
            populate: { items: { populate: ['product'] }, sale: true },
        },
    }),

    /** Create a new sale — body is provided by the caller as { data }. */
    create: () => ({
        path: '/sales',
        action: 'create',
        method: 'post',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff']
    }),

    /**
     * Update a sale by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId) => ({
        path: `/sales/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['sale'],
        approle: ['admin', 'manager']
    }),

    /**
     * Cancel a sale.
     * @param {string} documentId
     */
    cancel: (documentId) => ({
        path: `/sales/${documentId}/cancel`,
        action: 'cancel',
        method: 'put',
        apps: ['sale'],
        approle: ['admin', 'manager']
    }),

    /**
     * Save notes on a sale — body provided by caller as { data: { notes } }.
     * @param {string} documentId
     */
    saveNotes: (documentId) => ({
        path: `/sales/${documentId}`,
        action: 'saveNotes',
        method: 'put',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff']
    }),

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

    /**
     * Fetch a generic entity list (sales, purchases, products, …).
     * Previously standalone function, now part of the endpoint object.
     * @param {string} entities - plural entity name
     * @param {number} page
     * @param {number} rowsPerPage
     */
    fetchEntities: async (entities, page, rowsPerPage = 100) => {
        return await authApi.fetch('/' + entities, {
            sort: ['id:desc'],
            populate: ['logo'],
            pagination: { page, pageSize: rowsPerPage },
        });
    },

    /**
     * Fetch a paginated list of sales.
     * Previously standalone function, now part of the endpoint object.
     * @param {number} page
     * @param {number} rowsPerPage
     * @param {{ sort?, filters?, populate? }} opts
     */
    fetchSales: async (page, rowsPerPage = 200, { sort, filters, populate } = {}) => {
        const ep = SalesEndpoints.list(page, rowsPerPage, { sort, filters, populate });
        return await authApi.fetch(ep.path, ep.params);
    },

    /**
     * Fetch a single sale by documentId, numeric id, or invoice_no.
     * Also hydrates _exchangeReturns from the populated relation.
     * Previously standalone function, now part of the endpoint object.
     * @param {string|number} id
     */
    fetchSaleByIdOrInvoice: async (id) => {
        const byIdEp = SalesEndpoints.byId(id);
        const res = await authApi.get(byIdEp.path, byIdEp.params);
        const data = res?.data ?? res;
        const sale = Array.isArray(data) ? data[0] : data;
        if (sale) {
            const populated = sale.exchange_returns;
            if (Array.isArray(populated) && populated.length > 0) {
                sale._exchangeReturns = populated;
            } else if (populated && typeof populated === 'object' && !Array.isArray(populated)) {
                sale._exchangeReturns = [populated];
            }
            if (!sale._exchangeReturns?.length) {
                const saleDocId = sale.documentId || sale.id;
                try {
                    const excEp = SalesEndpoints.exchangeReturns(saleDocId);
                    const excRes = await authApi.get(excEp.path, excEp.params);
                    const excData = excRes?.data ?? excRes;
                    const excReturns = Array.isArray(excData) ? excData : excData ? [excData] : [];
                    if (excReturns.length > 0) {
                        sale._exchangeReturns = excReturns;
                    }
                } catch (err) {
                    console.error('Failed to load exchange returns', err);
                }
            }
        }
        return sale;
    },

    /**
     * Create a new draft sale owned by the current user.
     * Previously standalone function, now part of the endpoint object.
     * @returns {{ data, id, nameSingular, namePlural }}
     */
    createSale: async () => {
        const user = getUser();
        const data = {
            invoice_no: generateNextInvoiceNumber(),
            sale_date: new Date().toISOString(),
            total: 0,
            owners: { connect: [user.documentId] },
        };
        const res = await SalesEndpoints.postCreate(data);
        const rdata = res?.data ?? res;
        return { data: rdata, id: rdata.documentId ?? rdata.id, nameSingular: 'sale', namePlural: 'sales' };
    },

    /**
     * Search sales by customer name/phone or invoice number.
     * Previously standalone function, now part of the endpoint object.
     * @param {string} searchTerm
     * @param {number} page
     * @param {number} rowsPerPage
     */
    searchSales: async (searchTerm, page = 1, rowsPerPage = 5) => {
        const hasSearch = searchTerm && searchTerm.trim().length > 0;
        const query = {
            populate: {
                customer: true,
                logo: true,
                gallery: true,
                items: { populate: { product: true } },
            },
            pagination: { page, pageSize: rowsPerPage },
        };
        if (hasSearch) {
            query.filters = {
                $or: [
                    { customer: { $or: [{ name: { $containsi: searchTerm } }, { phone: { $containsi: searchTerm } }] } },
                    { invoice_no: { $eq: searchTerm } },
                ],
            };
        }
        const qs = (await import('qs')).default;
        const res = await authApi.fetch(`/sales?${qs.stringify(query, { encodeValuesOnly: true })}`);
        return dataNode(res);
    },
};

/**
 * SalesEndpointRules
 *
 * Per-endpoint requestRules that are stored in the api-guard-pro resource record.
 * Once seeded, clients only pass minimal lookup values; the server injects
 * filters, populate, and other params from these rules at request time.
 *
 * Token syntax:
 *   $query.<name>   → ctx.query.<name>   (URL query param)
 *   $params.<name>  → ctx.params.<name>  (URL path param, e.g. :id)
 *   $body.<name>    → ctx.request.body.data.<name>
 *   $user.id        → authenticated user id
 *   $today          → current date ISO string (date only)
 *   $now            → current datetime ISO string
 */
export const SalesEndpointRules = {
    /**
     * GET /api/sales — list
     * Client passes: ?page=1&pageSize=200  (optional sort/filters passed through)
     * Server injects: default sort and a rich populate.
     */
    list: {
        injectPopulate: {
            customer: true,
            employee: true,
            cash_register: true,
        },
    },

    /**
     * GET /api/sales — byId (uses list path with injected $or filter)
     * Client passes: ?q=INV-001  (invoice_no OR documentId)
     * Server injects: full detail populate + $or filter.
     *
     * Resource key: get.api.sales.byId
     * pathPattern: /api/sales  (same path as list; distinguished by resource key via canonical URL)
     */
    byId: {
        filters: {
            $or: [
                { invoice_no: '$query.q' },
                { id: '$query.q' },
                { documentId: '$query.q' },
            ],
        },
        injectPopulate: {
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

    /**
     * PUT /api/sales/:id — cancel
     * No extra requestRules needed; route distinction is by canonical URL.
     */
    cancel: {},

    /**
     * PUT /api/sales/:id — saveNotes
     * Whitelist body to only allow notes field.
     */
    saveNotes: {
        allowedBodyFields: ['notes'],
    },
};