/**
 * BrandGroupsEndpoints
 * Pure endpoint descriptors for the /brand-groups resource.
 * All methods return { path, params?, data? } objects.
 * Transport execution happens via createClientProxy in /endpoints/brand-groups.js.
 */
export const BrandGroupsEndpoints = {

    meta: {
        uid: 'api::brand-group.brand-group',
        domains: ['stock', 'brand'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * List brand groups in draft status.
     * @param {{ sort?, populate?, pagination? }} opts
     */
    listDraft: ({ sort, populate, pagination } = {}) => ({
        path: '/brand-groups',
        action: 'find',
        method: 'get',
        params: {
            status: 'draft',
            sort: sort ?? ['sort_order:asc', 'createdAt:desc'],
            populate: populate ?? ['brands'],
            pagination: pagination ?? { pageSize: 50 },
        },
    }),

    /**
     * List brand groups in published status.
     * @param {{ pageSize?, sort?, populate? }} opts
     */
    listPublished: ({ pageSize = 200, sort, populate } = {}) => ({
        path: '/brand-groups',
        action: 'find',
        method: 'get',
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
            ...(sort ? { sort } : {}),
            ...(populate ? { populate } : {}),
        },
    }),

    /**
     * List all brand groups (any status).
     * @param {{ sort?, populate?, pagination?, filters? }} opts
     */
    list: ({ sort, populate, pagination, filters } = {}) => ({
        path: '/brand-groups',
        action: 'find',
        method: 'get',
        params: {
            sort: sort ?? ['sort_order:asc', 'createdAt:desc'],
            populate: populate ?? ['brands'],
            pagination: pagination ?? { page: 1, pageSize: 100 },
            ...(filters ? { filters } : {}),
        },
    }),

    /**
     * Get brand group by documentId in draft status.
     * @param {string} documentId
     * @param {{ populate? }} opts
     */
    byIdDraft: (documentId, { populate } = {}) => ({
        path: `/brand-groups/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: {
            status: 'draft',
            ...(populate ? { populate } : {}),
        },
    }),

    /**
     * Get brand group by documentId in published status.
     * @param {string} documentId
     * @param {{ fields?, populate? }} opts
     */
    byIdPublished: (documentId, { fields, populate } = {}) => ({
        path: `/brand-groups/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: {
            status: 'published',
            ...(fields ? { fields } : {}),
            ...(populate ? { populate } : {}),
        },
    }),

    /**
     * Get brand group by documentId (any status).
     * @param {string} documentId
     * @param {{ populate?, status? }} opts
     */
    byId: (documentId, { populate, status } = {}) => ({
        path: `/brand-groups/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: {
            ...(status ? { status } : {}),
            ...(populate ? { populate } : {}),
        },
    }),

    /**
     * Create a new brand group.
     * @param {object} data - The brand group data { name, brands, sort_order, ... }
     */
    create: (data) => ({
        path: '/brand-groups',
        action: 'create',
        method: 'post',
        data,
    }),

    /**
     * Update a brand group (any status).
     * @param {string} documentId
     * @param {object} data - The updated brand group data
     */
    update: (documentId, data) => ({
        path: `/brand-groups/${documentId}`,
        action: 'update',
        method: 'put',
        data,
    }),

    /**
     * Update a brand group in draft status.
     * @param {string} documentId
     * @param {object} data - The updated brand group data
     */
    updateDraft: (documentId, data) => ({
        path: `/brand-groups/${documentId}`,
        action: 'update',
        method: 'put',
        params: { status: 'draft' },
        data,
    }),

    /**
     * Publish a brand group — custom Strapi action.
     * @param {string} documentId
     */
    publish: (documentId) => ({
        path: `/brand-groups/${documentId}/publish`,
        action: 'publish',
        method: 'post',
    }),

    /**
     * Unpublish a brand group — custom Strapi action.
     * @param {string} documentId
     */
    unpublish: (documentId) => ({
        path: `/brand-groups/${documentId}/unpublish`,
        action: 'unpublish',
        method: 'post',
    }),

    /**
     * Delete a brand group by documentId.
     * @param {string} documentId
     */
    del: (documentId) => ({
        path: `/brand-groups/${documentId}`,
        action: 'delete',
        method: 'delete',
    }),
};