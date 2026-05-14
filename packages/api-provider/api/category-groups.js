import __publish_generic_helper from './__publish_generic_helper.js'
import { listParams, byIdParams } from './__param_builders.js';

export const CategoryGroupsEndpoints = {
    meta: { domains: ['cms'] },

    listDraft: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/category-groups',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['sort_order:asc', 'createdAt:desc'], populate: ['categories'], pageSize: 50 },
            { status: 'draft' },
        ),
    }),

    listPublished: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/category-groups',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { pageSize: 200, fields: ['documentId'] },
            { status: 'published' },
        ),
    }),

    byIdDraft: (documentId, { populate, fields } = {}) => ({
        path: `/category-groups/${documentId}`,
        params: byIdParams({ populate, fields }, {}, { status: 'draft' }),
    }),

    byIdPublished: (documentId, { populate, fields } = {}) => ({
        path: `/category-groups/${documentId}`,
        params: byIdParams({ populate, fields }, {}, { status: 'published' }),
    }),

    ...__publish_generic_helper('category-groups'),

};