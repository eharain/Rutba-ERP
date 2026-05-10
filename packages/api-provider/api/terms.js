export const TermsEndpoints = {
    /**
     * List terms.
     * @param {{ sort?, filters? }} opts
     */
    list: ({ sort, filters } = {}) => ({
        path: '/terms',
        params: {
            sort: sort ?? ['name:asc'],
            ...(filters ? { filters } : {}),
        },
    }),

    /** Create a term. */
    create: (data) => ({ path: '/terms', action: 'create', method: 'post', data , data }),

    /** Update a term. */
    update: (id, data) => ({ path: `/terms/${id}`, action: 'update', method: 'put', data , data }),

    del: (id) => ({ path: `/terms/${id}`, action: 'delete', method: 'delete' }),

};
