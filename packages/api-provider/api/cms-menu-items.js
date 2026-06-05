/**
 * CmsMenuItemsEndpoints
 * Pure endpoint descriptors for the /cms-menu-items resource — individual
 * entries belonging to a CMS Menu. Edited from the rutba-cms menu builder.
 */
import { listParams, byIdParams } from './__param_builders.js';

const ITEM_POPULATE = {
    icon_image: true,
    cms_page: { fields: ['title', 'slug', 'page_type'] },
    page_group: { fields: ['name', 'slug'] },
    product_group: { fields: ['name', 'slug'] },
    mega_category_group: { fields: ['name', 'slug'] },
    mega_brand_group: { fields: ['name', 'slug'] },
    menu: { fields: ['name', 'slug', 'position'] },
    parent: { fields: ['documentId', 'label'] },
    children: { fields: ['documentId', 'label', 'order'] },
};

export const CmsMenuItemsEndpoints = {

    meta: {
        uid: 'api::cms-menu-item.cms-menu-item',
        domains: ['cms'],
        roles: ['admin', 'manager', 'staff'],
    },

    listDraft: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cms-menu-items',
        action: 'find',
        method: 'get',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['order:asc'], populate: ITEM_POPULATE, pageSize: 200 },
            { status: 'draft' },
        ),
    }),

    listPublished: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cms-menu-items',
        action: 'find',
        method: 'get',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { pageSize: 500, fields: ['documentId'] },
            { status: 'published' },
        ),
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cms-menu-items',
        action: 'find',
        method: 'get',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['order:asc'], populate: ITEM_POPULATE, pageSize: 200 },
        ),
    }),

    byIdDraft: (documentId, { populate, fields } = {}) => ({
        path: `/cms-menu-items/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: byIdParams({ populate, fields }, { populate: ITEM_POPULATE }, { status: 'draft' }),
    }),

    byIdPublished: (documentId, { populate, fields } = {}) => ({
        path: `/cms-menu-items/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: byIdParams({ populate, fields }, { populate: ITEM_POPULATE }, { status: 'published' }),
    }),

    byId: (documentId, { populate, fields, status } = {}) => ({
        path: `/cms-menu-items/${documentId}`,
        action: 'findOne',
        method: 'get',
        params: byIdParams({ populate, fields }, { populate: ITEM_POPULATE }, status ? { status } : {}),
    }),

    /**
     * Create a new menu item.
     * @param {object} data - { label, order, link_kind, url, menu, parent, ... }
     */
    create: (data) => ({
        path: '/cms-menu-items',
        action: 'create',
        method: 'post',
        data,
    }),

    update: (documentId, data) => ({
        path: `/cms-menu-items/${documentId}`,
        action: 'update',
        method: 'put',
        data,
    }),

    updateDraft: (documentId, data) => ({
        path: `/cms-menu-items/${documentId}`,
        action: 'update',
        method: 'put',
        params: { status: 'draft' },
        data,
    }),

    publish: (documentId) => ({
        path: `/cms-menu-items/${documentId}/publish`,
        action: 'publish',
        method: 'post',
    }),

    unpublish: (documentId) => ({
        path: `/cms-menu-items/${documentId}/unpublish`,
        action: 'unpublish',
        method: 'post',
    }),

    del: (documentId) => ({
        path: `/cms-menu-items/${documentId}`,
        action: 'delete',
        method: 'delete',
    }),
};
