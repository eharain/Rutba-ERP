/**
 * SeoMetasEndpoints
 * Path + params definitions for the /seo-metas content-type. seo-meta holds the
 * SEO and social-share fields previously stored inline on cms-page, plus a
 * relation back to the linked entity (today: cms-page).
 */
import { listParams, byIdParams } from './__param_builders.js';

export const SeoMetasEndpoints = {
    meta: {
        uid: 'api::seo-meta.seo-meta',
        domains: ['cms', 'web', 'web-user'],
        roles: ['admin', 'manager', 'staff', 'public', 'user'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields, search, entityType } = {}) => {
        const shortcutFilters = {};
        if (search) shortcutFilters.entity_title = { $containsi: search };
        if (entityType) shortcutFilters.entity_type = { $eq: entityType };
        return {
            path: '/seo-metas',
            action: 'find',
            method: 'get',
            apps: ['cms'],
            approle: ['admin', 'manager', 'staff'],
            params: listParams(
                { page, pageSize, sort, populate, filters, fields },
                {
                    sort: ['entity_title:asc'],
                    pageSize: 50,
                    populate: {
                        og_image: true,
                        cms_page:       { fields: ['title', 'slug'] },
                        product:        { fields: ['name'] },
                        category:       { fields: ['name', 'slug'] },
                        brand:          { fields: ['name', 'slug'] },
                        product_group:  { fields: ['name', 'slug'] },
                        brand_group:    { fields: ['name', 'slug'] },
                        category_group: { fields: ['name', 'slug'] },
                    },
                    ...(Object.keys(shortcutFilters).length > 0 ? { filters: shortcutFilters } : {}),
                },
            ),
        };
    },

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/seo-metas/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['cms', 'web', 'web-user'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: byIdParams(
            { populate, fields },
            {
                populate: {
                    og_image: true,
                    cms_page:       { fields: ['title', 'slug'] },
                    product:        { fields: ['name'] },
                    category:       { fields: ['name', 'slug'] },
                    brand:          { fields: ['name', 'slug'] },
                    product_group:  { fields: ['name', 'slug'] },
                    brand_group:    { fields: ['name', 'slug'] },
                    category_group: { fields: ['name', 'slug'] },
                },
            },
        ),
    }),

    byCmsPage: (cmsPageDocumentId) => ({
        path: '/seo-metas',
        action: 'find',
        method: 'get',
        apps: ['cms'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            filters: { cms_page: { documentId: { $eq: cmsPageDocumentId } } },
            populate: ['cms_page', 'og_image'],
            pagination: { page: 1, pageSize: 1 },
        },
    }),

    create: (data) => ({
        path: '/seo-metas',
        action: 'create',
        method: 'post',
        apps: ['cms'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/seo-metas/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['cms'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    del: (documentId) => ({
        path: `/seo-metas/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['cms'],
        approle: ['admin', 'manager'],
    }),
};
