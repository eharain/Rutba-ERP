import __publish_generic_helper from "./__publish_generic_helper.js";
import { listParams, byIdParams } from './__param_builders.js';

export const DeliveryMethodsEndpoints = {
    meta: {
        uid: 'api::delivery-method.delivery-method',
        domains: ['cms', 'order-management', 'web', 'web-user'],
        roles: ['admin', 'manager', 'staff', 'public', 'user'],
    },

    // todo: spread adds updateDraft/publish/unpublish/create/del. Verify the
    // delivery-method content type has draft-publish enabled; the inline
    // create/update below will override the helper's versions either way.
    ...__publish_generic_helper('delivery-methods'),
    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/delivery-methods',
        action: 'find',
        method: 'get',
        apps: ['cms', 'order-management', 'web', 'web-user'],
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
        apps: ['cms', 'order-management', 'web', 'web-user'],
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
        apps: ['cms', 'order-management', 'web', 'web-user'],
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