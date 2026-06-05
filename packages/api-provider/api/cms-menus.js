/**
 * CmsMenusEndpoints
 * Pure endpoint descriptors for the /cms-menus resource — CMS-driven navigation
 * menus (top / side / footer) for the storefront.
 */
import { listParams, byIdParams } from './__param_builders.js';

const MENU_POPULATE = {
    items: {
        populate: {
            icon_image: true,
            cms_page: { fields: ['title', 'slug', 'page_type'] },
            page_group: { fields: ['name', 'slug'] },
            product_group: { fields: ['name', 'slug'] },
            mega_category_group: { fields: ['name', 'slug'] },
            mega_brand_group: { fields: ['name', 'slug'] },
            parent: { fields: ['documentId', 'label'] },
            children: { fields: ['documentId', 'label', 'order'] },
        },
    },
};

export const CmsMenusEndpoints = {

    meta: {
        uid: 'api::cms-menu.cms-menu',
        domains: ['cms'],
        roles: ['admin', 'manager', 'staff'],
    },

    listDraft: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cms-menus',
        action: 'find',
        method: 'get',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['position:asc', 'name:asc'], populate: MENU_POPULATE, pageSize: 50 },
            { status: 'draft' },
        ),
    }),

    listPublished: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cms-menus',
        action: 'find',
        method: 'get',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { pageSize: 200, fields: ['documentId'] },
            { status: 'published' },
        ),
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cms-menus',
        action: 'find',
        method: 'get',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['position:asc', 'name:asc'], populate: MENU_POPULATE, pageSize: 100 },
        ),
    }),

    byIdDraft: (documentId, { populate, fields } = {}) => ({
        path: `/cms-menus/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: byIdParams({ populate, fields }, { populate: MENU_POPULATE }, { status: 'draft' }),
    }),

    byIdPublished: (documentId, { populate, fields } = {}) => ({
        path: `/cms-menus/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: byIdParams({ populate, fields }, { populate: MENU_POPULATE }, { status: 'published' }),
    }),

    byId: (documentId, { populate, fields, status } = {}) => ({
        path: `/cms-menus/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: byIdParams({ populate, fields }, { populate: MENU_POPULATE }, status ? { status } : {}),
    }),

    /**
     * Create a new menu.
     * @param {object} data - { name, title, position, enabled, items, ... }
     */
    create: (data) => ({
        path: '/cms-menus',
        action: 'create',
        method: 'post',
        data,
    }),

    update: (documentId, data) => ({
        path: `/cms-menus/${documentId}`,
        action: 'update',
        method: 'put',
        data,
    }),

    updateDraft: (documentId, data) => ({
        path: `/cms-menus/${documentId}`,
        action: 'update',
        method: 'put',
        params: { status: 'draft' },
        data,
    }),

    publish: (documentId) => ({
        path: `/cms-menus/${documentId}/publish`,
        action: 'publish',
        method: 'post',
    }),

    unpublish: (documentId) => ({
        path: `/cms-menus/${documentId}/unpublish`,
        action: 'unpublish',
        method: 'post',
    }),

    del: (documentId) => ({
        path: `/cms-menus/${documentId}`,
        action: 'delete',
        method: 'delete',
    }),
};
