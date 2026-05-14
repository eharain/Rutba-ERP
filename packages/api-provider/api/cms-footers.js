import __publish_generic_helper from "./__publish_generic_helper.js";
import { listParams, byIdParams } from './__param_builders.js';

export const CmsFootersEndpoints = {
    meta: {
        uid: 'api::cms-footer.cms-footer',
        domains: ['cms', 'web', 'web-user'],
        roles: ['admin', 'manager', 'staff', 'public', 'user'],
    },

    listDraft: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cms-footers',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['name:asc'], populate: ['pinned_pages', 'cms_pages'], pageSize: 100 },
            { status: 'draft' },
        ),
    }),

    listPublished: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/cms-footers',
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { pageSize: 200, fields: ['documentId'] },
            { status: 'published' },
        ),
    }),

    byIdDraft: (documentId, { populate, fields } = {}) => ({
        path: `/cms-footers/${documentId}`,
        params: byIdParams({ populate, fields }, {}, { status: 'draft' }),
    }),

    byIdPublished: (documentId, { populate, fields } = {}) => ({
        path: `/cms-footers/${documentId}`,
        params: byIdParams({ populate, fields }, {}, { status: 'published' }),
    }),

    ...__publish_generic_helper('cms-footers'),

};