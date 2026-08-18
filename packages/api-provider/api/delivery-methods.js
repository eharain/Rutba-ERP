import { draftMethods, standard } from "./__publish_generic_helper.js";
import { listParams, byIdParams } from './__param_builders.js';

export const DeliveryMethodsEndpoints = {
    meta: {
        uid: 'api::delivery-method.delivery-method',
        domains: ['cms', 'orders', 'storefront', 'portal'],
        roles: ['admin', 'manager', 'staff', 'public', 'user'],
    },

    // The todo that used to sit here asked whether delivery-method has
    // draft-publish. It does not (draftAndPublish: false), and services/strapi has
    // no publish route for it — so the helper's publish/unpublish pair could
    // never resolve. updateDraft stays (apps/content/cms/pages/delivery-methods.js
    // uses it); the inline create/update below still override the rest.
    ...draftMethods('delivery-methods'),
    ...standard('delivery-methods'),
    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/delivery-methods',
        action: 'find',
        method: 'get',
        apps: ['cms', 'orders', 'storefront', 'portal'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            { sort: ['priority:asc', 'createdAt:desc'], populate: ['delivery_zones', 'product_groups'], pageSize: 200 },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/delivery-methods/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['cms', 'orders', 'storefront', 'portal'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: byIdParams({ populate, fields }),
    }),
    byIdDraft: (documentId, { populate, fields } = {}) => ({
        path: `/delivery-methods/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['cms'],
        approle: ['admin', 'manager', 'staff'],
        params: byIdParams({ populate, fields }, {}, { status: 'draft' }),
    }),
    byIdPublished: (documentId, { populate, fields } = {}) => ({
        path: `/delivery-methods/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['cms', 'orders', 'storefront', 'portal'],
        approle: ['admin', 'manager', 'staff', 'public', 'user'],
        params: byIdParams({ populate, fields }, {}, { status: 'published' }),
    }),
    create: (data) => ({
        path: '/delivery-methods',
        action: 'create',
        method: 'post',
        apps: ['cms'],
        approle: ['admin', 'manager'],
        data,
    }),
    update: (documentId, data) => ({
        path: `/delivery-methods/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['cms'],
        approle: ['admin', 'manager'],
        data,
    }),
};