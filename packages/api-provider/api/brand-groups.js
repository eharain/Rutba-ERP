/**
 * BrandGroupsEndpoints
 * Pure endpoint descriptors for the /brand-groups resource.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const BrandGroupsEndpoints = {

    meta: {
        uid: 'api::brand-group.brand-group',
        domains: ['cms', 'stock'],
        roles: ['admin', 'manager', 'staff'],
    },

    listDraft: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/brand-groups',
        action: 'find',
        method: 'get',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['sort_order:asc', 'createdAt:desc'], populate: ['brands'], pageSize: 50 },
            { status: 'draft' },
        ),
    }),

    listPublished: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/brand-groups',
        action: 'find',
        method: 'get',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { pageSize: 200, fields: ['documentId'] },
            { status: 'published' },
        ),
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/brand-groups',
        action: 'find',
        method: 'get',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['sort_order:asc', 'createdAt:desc'], populate: ['brands'], pageSize: 100 },
        ),
    }),

    byIdDraft: (documentId, { populate, fields } = {}) => ({
        path: `/brand-groups/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: byIdParams({ populate, fields }, {}, { status: 'draft' }),
    }),

    byIdPublished: (documentId, { populate, fields } = {}) => ({
        path: `/brand-groups/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: byIdParams({ populate, fields }, {}, { status: 'published' }),
    }),

    byId: (documentId, { populate, fields, status } = {}) => ({
        path: `/brand-groups/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: byIdParams({ populate, fields }, {}, status ? { status } : {}),
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