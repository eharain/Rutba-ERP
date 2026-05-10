export const SaleOrdersEndpoints = {
    list: ({ sort, pagination, populate } = {}) => ({
        path: '/sale-orders',
        params: {
            sort: sort ?? ['createdAt:desc'],
            pagination: pagination ?? { page: 1, pageSize: 25 },
            populate: populate ?? ['customer_contact', 'delivery_method', 'assigned_rider', 'delivery_zone'],
        },
    }),
    byId: (documentId, params = {}) => ({ path: `/sale-orders/${documentId}`, params }),
    create: (data) => ({ path: '/sale-orders', action: 'create', method: 'post', data , data }),
    update: (documentId, data) => ({ path: `/sale-orders/${documentId}`, action: 'update', method: 'put', data , data }),
    updateStatus: (documentId, data) => ({ path: `/sale-orders/${documentId}/update-status`, action: 'updateStatus', method: 'post', data }),
    assignRider: (documentId, data) => ({ path: `/sale-orders/${documentId}/assign-rider`, action: 'assignRider', method: 'post', data }),

};