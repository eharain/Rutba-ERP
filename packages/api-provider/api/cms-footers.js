import __publish_generic_helper from "./__publish_generic_helper.js";

export const CmsFootersEndpoints = {
    listDraft: ({ sort, populate, pagination, filters } = {}) => ({
        path: '/cms-footers',
        params: {
            status: 'draft',
            sort: sort ?? ['name:asc'],
            populate: populate ?? ['pinned_pages', 'cms_pages'],
            pagination: pagination ?? { pageSize: 100 },
            ...(filters ? { filters } : {}),
        },
    }),

    listPublished: ({ pageSize = 200 } = {}) => ({
        path: '/cms-footers',
        params: {
            status: 'published',
            fields: ['documentId'],
            pagination: { pageSize },
        },
    }),

    byIdDraft: (documentId, { populate } = {}) => ({
        path: `/cms-footers/${documentId}`,
        params: {
            status: 'draft',
            ...(populate ? { populate } : {}),
        },
    }),

    byIdPublished: (documentId, { fields, populate } = {}) => ({
        path: `/cms-footers/${documentId}`,
        params: {
            status: 'published',
            ...(fields ? { fields } : {}),
            ...(populate ? { populate } : {}),
        },
    }),

    ...__publish_generic_helper('cms-footers'),

};