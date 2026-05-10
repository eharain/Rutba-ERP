/**
 * SalesEndpoints
 * Pure endpoint descriptors for the /sales resource.
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

    /** Create a new sale. */
    create: (data) => ({
        path: '/sales',
        action: 'create',
        method: 'post',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Update a sale by documentId. */
    update: (documentId, data) => ({
        path: `/sales/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['sale'],
        approle: ['admin', 'manager'],
        data,
    }),

    /** Cancel a sale. */
    cancel: (documentId, data) => ({
        path: `/sales/${documentId}/cancel`,
        action: 'cancel',
        method: 'put',
        apps: ['sale'],
        approle: ['admin', 'manager'],
        data,
    }),

    /** Save notes on a sale. */
    saveNotes: (documentId, data) => ({
        path: `/sales/${documentId}`,
        action: 'saveNotes',
        method: 'put',
        apps: ['sale'],
        approle: ['admin', 'manager', 'staff'],
        data,
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
    sales(page, rowsPerPage = 200, { sort, filters, populate } = {}) {
        return {
            url: '/sales',
            params: {
                sort: sort || ['createdAt:desc'],
                filters: filters || undefined,
                pagination: { page, pageSize: rowsPerPage },
                populate: populate || { customer: true, employee: true, cash_register: true },
            }
        }
    },
    saleByIdOrInvoice(id) {
        return {

            url: "/sales",

            params: {
                filters: {
                    $or: [{ invoice_no: id }, { id }, { documentId: id }]
                },
                populate: {
                    payments: true,
                    customer: true,
                    cash_register: { fields: ['id', 'documentId', 'desk_id', 'desk_name', 'branch_name', 'opened_by', 'opened_at', 'status'] },
                    items: { populate: { product: true, items: { populate: ['product'] } } },
                    sale_returns: { populate: { items: { populate: ['product'] } } },
                    exchange_return: { populate: { items: { populate: ['product'] }, sale: true } }
                }
            }
        }
    }
}
