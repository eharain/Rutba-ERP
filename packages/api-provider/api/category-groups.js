import { __publish_generic_helper } from './__publish_generic_helper'

export const CategoryGroupsEndpoints = {
    listDraft: ({ sort, populate, pagination } = {}) => ({
        path: '/category-groups',
        params: {
            status: 'draft',
            sort: sort ?? ['sort_order:asc', 'createdAt:desc'],
            populate: populate ?? ['categories'],
            pagination: pagination ?? { pageSize: 50 },
        },
    }),

    listPublished: ({ pageSize = 200 } = {}) => ({
        path: '/category-groups',
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
        },
    }),

    byIdDraft: (documentId, { populate } = {}) => ({
        path: `/category-groups/${documentId}`,
        params: {
            status: 'draft',
            ...(populate ? { populate } : {}),
        },
    }),

    byIdPublished: (documentId, { fields, populate } = {}) => ({
        path: `/category-groups/${documentId}`,
        params: {
            status: 'published',
            ...(fields ? { fields } : {}),
            ...(populate ? { populate } : {}),
        },
    }),

    ...__publish_generic_helper('category-groups'),

};