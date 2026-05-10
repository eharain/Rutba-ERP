export const SaleOrdersEndpoints = {
    meta: {
        uid: 'api::sale-order.sale-order',
        domains: ['order-management', 'sale', 'delivery'],
        roles: ['admin', 'manager', 'staff']
    },

    list: ({ sort, pagination, populate } = {}) => ({
        path: '/sale-orders',
        action: 'find',
        method: 'get',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['createdAt:desc'],
            pagination: pagination ?? { page: 1, pageSize: 25 },
            populate: populate ?? ['customer_contact', 'delivery_method', 'assigned_rider', 'delivery_zone'],
        },
    }),
    byId: (documentId, params = {}) => ({
        path: `/sale-orders/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        params,
    }),
    create: (data) => ({
        path: '/sale-orders',
        action: 'create',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    update: (documentId, data) => ({
        path: `/sale-orders/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    updateStatus: (documentId, data) => ({
        path: `/sale-orders/${documentId}/update-status`,
        action: 'updateStatus',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    assignRider: (documentId, data) => ({
        path: `/sale-orders/${documentId}/assign-rider`,
        action: 'assignRider',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

};