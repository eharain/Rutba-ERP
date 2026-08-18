/**
 * SalesEndpoints
 * Pure endpoint descriptors for the /sales resource.
 */

// Per-role scope shared by every policy below. Admin/manager: unrestricted.
// Staff: own sales from the last 7 days (single-row lookups stay
// ownership-only; create stamps `owners`).
// ownerField MUST be the `owners` UP-user relation — `createdBy` is Strapi's
// ADMIN-user creator and stays NULL on content-api writes, so staff would
// match zero rows. `owners` is stamped server-side by the documents-layer
// policy enforcer on core create.
const ROLE_SCOPES = {
    admin: {},
    manager: {},
    staff: {
        scope: 'owner+recency',
        ownerField: 'owners',
        recencyField: 'createdAt',
    },
};

export const SalesEndpoints = {

    /** Resource metadata for policy generation */
    meta: {
        uid: 'api::sale.sale',
        domains: ['pos'],
        roles: ['admin', 'manager', 'staff'],
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
        apps: ['pos'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: {
            sort: sort ?? ['createdAt:desc'],
            filters: filters ?? undefined,
            pagination: { page, pageSize },
            populate: populate ?? { customer: true, employee: true, cash_register: true },
        },
    }),

    /**
     * Fetch a single sale by documentId / id / invoice_no with full detail populate.
     *
     * The identity match and the whole populate tree live in the `sale.detail`
     * controller — spelled out here they made a ~2KB querystring, which is the
     * single largest URL the POS issues and which every sale-page load, receipt
     * print and post-save reload repeated. Keep the method named `byId`: the
     * api-pro seeder only walks descriptor methods whose name starts with a
     * known verb, and `detail` is not one of them. `action` is what has to match
     * the route handler (`sale.detail`) for the policy lookup to resolve.
     *
     * @param {string|number} idOrInvoice
     */
    byId: (idOrInvoice) => ({
        path: `/sales/${idOrInvoice}/detail`,
        action: 'detail',
        method: 'get',
        apps: ['pos'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    /**
     * Fallback query for exchange returns linked to a sale.
     * @param {string} saleDocId
     */
    exchangeReturns: (saleDocId) => ({
        path: '/sale-returns/',
        action: 'find',
        method: 'get',
        apps: ['pos'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
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
        apps: ['pos'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Update a sale by documentId. */
    // `staff` matches create: a cashier who can open a sale must be able to
    // re-save it. Every checkout and every edit of an existing sale runs this
    // first (saveSale writes the header before the lines), so excluding staff
    // 403s the whole save. Row-level reach stays bounded by ROLE_SCOPES, which
    // limits staff to their own recent sales.
    update: (documentId, data) => ({
        path: `/sales/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['pos'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Cancel a sale. */
    cancel: (documentId, data) => ({
        path: `/sales/${documentId}/cancel`,
        action: 'cancel',
        method: 'put',
        apps: ['pos'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    /**
     * Server-side checkout. Records payments and — only when the sale becomes
     * fully paid — releases stock (→ Sold), completes the sale, and posts
     * accounting. Used to check out a locked pay-later sale without rewriting
     * its (frozen) line items.
     */
    checkout: (documentId, data) => ({
        path: `/sales/${documentId}/checkout`,
        action: 'checkout',
        method: 'post',
        apps: ['pos'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /**
     * Mark a sale "pay later": lock its line items and move its stock to the
     * chosen status for this order (Reserved / Sold / InStock). Requires a
     * customer. Admin/manager only.
     * Body: { stock_status: 'Reserved' | 'Sold' | 'InStock' }
     */
    markPayLater: (documentId, data) => ({
        path: `/sales/${documentId}/pay-later`,
        action: 'markPayLater',
        method: 'post',
        apps: ['pos'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    /**
     * Unlock a pay-later sale back to an editable draft and move its stock to
     * the chosen status (default InStock). Admin/manager only.
     * Body: { stock_status?: 'Reserved' | 'Sold' | 'InStock' }
     */
    unlockPayLater: (documentId, data) => ({
        path: `/sales/${documentId}/pay-later/unlock`,
        action: 'unlockPayLater',
        method: 'post',
        apps: ['pos'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Save notes on a sale. Caller passes the raw notes string; the
     * descriptor shapes it into the field-update payload Strapi expects. */
    saveNotes: (documentId, notes) => ({
        path: `/sales/${documentId}`,
        action: 'saveNotes',
        method: 'put',
        apps: ['pos'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data: { notes },
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
