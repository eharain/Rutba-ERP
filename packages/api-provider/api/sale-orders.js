import { listParams, byIdParams } from './__param_builders.js';

// Per-role scope shared by every policy below. Staff sees only orders they
// created in the last 7 days; admin/manager unrestricted.
const ROLE_SCOPES = {
    admin: {},
    manager: {},
    staff: { scope: 'owner+recency', ownerField: 'createdBy', recencyField: 'createdAt' },
};

export const SaleOrdersEndpoints = {
    meta: {
        uid: 'api::sale-order.sale-order',
        domains: ['order-management', 'sale', 'delivery'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/sale-orders',
        action: 'find',
        method: 'get',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            {
                sort: ['createdAt:desc'],
                pageSize: 25,
                populate: ['customer_contact', 'delivery_method', 'assigned_rider', 'delivery_zone'],
            },
        ),
    }),
    byId: (documentId, { populate, fields } = {}) => ({
        path: `/sale-orders/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: byIdParams({ populate, fields }),
    }),
    create: (data) => ({
        path: '/sale-orders',
        action: 'create',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
    update: (documentId, data) => ({
        path: `/sale-orders/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
    updateStatus: (documentId, data) => ({
        path: `/sale-orders/${documentId}/update-status`,
        action: 'updateStatus',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
    assignRider: (documentId, data) => ({
        path: `/sale-orders/${documentId}/assign-rider`,
        action: 'assignRider',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
    // todo: speculative stub — added so rutba-rider/pages/deliveries/[id].js
    // call site resolves at the descriptor level. Verify route path against
    // pos-strapi (order-message content type) and confirm controller action
    // exists before relying on the wire shape.
    messages: (documentId) => ({
        path: `/sale-orders/${documentId}/messages`,
        action: 'messages',
        method: 'get',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),
    // todo: speculative stub — see messages above.
    sendMessage: (documentId, data) => ({
        path: `/sale-orders/${documentId}/messages`,
        action: 'sendMessage',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

};
