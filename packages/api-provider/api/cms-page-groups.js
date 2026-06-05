/**
 * CmsPageGroupsEndpoints
 * Pure endpoint descriptors for the /cms-page-groups resource — curated groups
 * of CMS pages rendered as flip cards on the storefront.
 */
import { listParams, byIdParams } from './__param_builders.js';

export const CmsPageGroupsEndpoints = {

    meta: {
        uid: 'api::cms-page-group.cms-page-group',
        domains: ['cms', 'stock'],
        roles: ['admin', 'manager', 'staff'],
    },

    listDraft: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cms-page-groups',
        action: 'find',
        method: 'get',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['sort_order:asc', 'createdAt:desc'], populate: ['cover_image', 'pages'], pageSize: 50 },
            { status: 'draft' },
        ),
    }),

    listPublished: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cms-page-groups',
        action: 'find',
        method: 'get',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { pageSize: 200, fields: ['documentId'] },
            { status: 'published' },
        ),
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cms-page-groups',
        action: 'find',
        method: 'get',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['sort_order:asc', 'createdAt:desc'], populate: ['cover_image', 'pages'], pageSize: 100 },
        ),
    }),

    byIdDraft: (documentId, { populate, fields } = {}) => ({
        path: `/cms-page-groups/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: byIdParams({ populate, fields }, { populate: ['cover_image', 'pages'] }, { status: 'draft' }),
    }),

    byIdPublished: (documentId, { populate, fields } = {}) => ({
        path: `/cms-page-groups/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: byIdParams({ populate, fields }, { populate: ['cover_image', 'pages'] }, { status: 'published' }),
    }),

    byId: (documentId, { populate, fields, status } = {}) => ({
        path: `/cms-page-groups/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: byIdParams({ populate, fields }, { populate: ['cover_image', 'pages'] }, status ? { status } : {}),
    }),

    /**
     * Create a new CMS page group.
     * @param {object} data - { name, title, excerpt, layout, columns, pages, sort_order, ... }
     */
    create: (data) => ({
        path: '/cms-page-groups',
        action: 'create',
        method: 'post',
        data,
    }),

    /**
     * Update a CMS page group (any status).
     * @param {string} documentId
     * @param {object} data
     */
    update: (documentId, data) => ({
        path: `/cms-page-groups/${documentId}`,
        action: 'update',
        method: 'put',
        data,
    }),

    /**
     * Update a CMS page group in draft status.
     * @param {string} documentId
     * @param {object} data
     */
    updateDraft: (documentId, data) => ({
        path: `/cms-page-groups/${documentId}`,
        action: 'update',
        method: 'put',
        params: { status: 'draft' },
        data,
    }),

    /**
     * Publish a CMS page group — custom Strapi action.
     * @param {string} documentId
     */
    publish: (documentId) => ({
        path: `/cms-page-groups/${documentId}/publish`,
        action: 'publish',
        method: 'post',
    }),

    /**
     * Unpublish a CMS page group — custom Strapi action.
     * @param {string} documentId
     */
    unpublish: (documentId) => ({
        path: `/cms-page-groups/${documentId}/unpublish`,
        action: 'unpublish',
        method: 'post',
    }),

    /**
     * Delete a CMS page group by documentId.
     * @param {string} documentId
     */
    del: (documentId) => ({
        path: `/cms-page-groups/${documentId}`,
        action: 'delete',
        method: 'delete',
    }),
};
