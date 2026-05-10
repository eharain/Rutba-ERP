/**
 * TermTypesEndpoints
 * Pure endpoint descriptors for the /term-types resource.
 */
export const TermTypesEndpoints = {
    meta: {
        uid: 'api::term-type.term-type',
        domains: ['stock', 'sale'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * List variant term-types (is_variant = true) with their terms.
     * @param {{ page?, pageSize? }} opts
     */
    listVariants: ({ page = 1, pageSize = 500 } = {}) => ({
        path: '/term-types',
        action: 'find',
        method: 'get',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: { is_variant: true },
            populate: { terms: true },
            pagination: { page, pageSize },
            sort: ['name:asc'],
        },
    }),

    /**
     * List term-types with their terms populated.
     * @param {{ sort?, populate? }} opts
     */
    listWithTerms: ({ sort, populate } = {}) => ({
        path: '/term-types',
        action: 'find',
        method: 'get',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['name:asc'],
            populate: populate ?? { terms: true },
        },
    }),

    /**
     * List term-types (no populate).
     * @param {{ sort? }} opts
     */
    list: ({ sort } = {}) => ({
        path: '/term-types',
        action: 'find',
        method: 'get',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        params: { sort: sort ?? ['name:asc'] },
    }),

    /** Create a term-type. */
    create: (data) => ({
        path: '/term-types',
        action: 'create',
        method: 'post',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Update a term-type by id/documentId. */
    update: (id, data) => ({
        path: `/term-types/${id}`,
        action: 'update',
        method: 'put',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (id) => ({
        path: `/term-types/${id}`,
        action: 'delete',
        method: 'delete',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager'],
    }),

};

