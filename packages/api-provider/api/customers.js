/**
 * CustomersEndpoints
 * Each `fetch*` method owns the full async call — callers use a single await.
 */
export const CustomersEndpoints = {

    meta: {
        uid: 'api::customer.customer',
        domains: ['sale', 'crm', 'delivery', 'web-authenticated', 'web-user'],
        roles: ['admin', 'manager', 'staff', 'user']
    },

    /**
     * Look up a customer by exact email or phone (duplicate check).
     * @param {{ email?, phone? }} opts
     */
    findByContact: ({ email, phone } = {}) => ({
        path: '/customers',
        action: 'find',
        method: 'get',
        apps: ['sale', 'crm', 'delivery', 'web-authenticated', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: {
            filters: {
                ...(email ? { email: { $eq: email } } : {}),
                ...(phone ? { phone: { $eq: phone } } : {}),
            },
            pagination: { pageSize: 1 },
        },
    }),

    /** Create a new customer — body provided by caller as { data }. */
    create: (data) => ({
        path: '/customers',
        action: 'create',
        method: 'post',
        apps: ['sale', 'crm', 'delivery', 'web-authenticated', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    /**
     * Search customers by name or phone (case-insensitive contains).
     * @param {string} q  search term
     * @param {number} pageSize
     */
    search: (q, pageSize = 10) => ({
        path: '/customers',
        action: 'find',
        method: 'get',
        apps: ['sale', 'crm', 'delivery', 'web-authenticated', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: {
            filters: {
                $or: [
                    { name: { $containsi: q } },
                    { phone: { $containsi: q } },
                ],
            },
            pagination: { pageSize },
        },
    }),

    /**
     * Update a customer by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId, data) => ({
        path: `/customers/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['sale', 'crm', 'delivery', 'web-authenticated', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

};

/**
 * CustomersEndpointRules
 * Per-endpoint requestRules stored in the api-guard-pro resource record.
 */
export const CustomersEndpointRules = {
    /**
     * GET /api/customers — findByContact
     * Client passes: ?email=<value> or ?phone=<value>
     * Server injects: exact-match filters
     */
    findByContact: {
        filters: {
            $or: [
                { email: { $eq: '$query.email' } },
                { phone: { $eq: '$query.phone' } },
            ],
        },
    },

    /**
     * GET /api/customers — search
     * Client passes: ?q=<term>
     * Server injects: $or containsi filter
     */
    search: {
        filters: {
            $or: [
                { name: { $containsi: '$query.q' } },
                { phone: { $containsi: '$query.q' } },
            ],
        },
    },

    /** POST /api/customers — create */
    create: {},

    /** PUT /api/customers/:id — update */
    update: {},
};