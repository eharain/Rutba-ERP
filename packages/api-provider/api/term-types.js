/**
 * TermTypesEndpoints
 * Pure endpoint descriptors for the /term-types resource.
 */
export const TermTypesEndpoints = {
    /**
     * List variant term-types (is_variant = true) with their terms.
     * @param {{ page?, pageSize? }} opts
     */
    listVariants: ({ page = 1, pageSize = 500 } = {}) => ({
        path: '/term-types',
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
        params: { sort: sort ?? ['name:asc'] },
    }),

    /** Create a term-type. */
    create: (data) => ({ path: '/term-types', action: 'create', method: 'post', data , data }),

    /** Update a term-type by id/documentId. */
    update: (id, data) => ({ path: `/term-types/${id}`, action: 'update', method: 'put', data , data }),

    del: (id) => ({ path: `/term-types/${id}`, action: 'delete', method: 'delete' }),

};

