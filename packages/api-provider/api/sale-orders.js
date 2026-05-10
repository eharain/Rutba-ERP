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
    create: () => ({ path: '/sale-orders' }),
    update: (documentId) => ({ path: `/sale-orders/${documentId}` }),
    updateStatus: (documentId) => ({ path: `/sale-orders/${documentId}/update-status` }),
    assignRider: (documentId) => ({ path: `/sale-orders/${documentId}/assign-rider` }),

    fetchList: (opts = {}) => {
        const ep = SaleOrdersEndpoints.list(opts);
        return authApi.fetch(ep.path, ep.params);
    },
    fetchById: (documentId, params = {}) => authApi.fetch(`/sale-orders/${documentId}`, params),
    postCreate: (data) => authApi.post('/sale-orders', data),
    putUpdate: (documentId, data) => authApi.put(`/sale-orders/${documentId}`, data),
    postUpdateStatus: (documentId, data) => authApi.post(`/sale-orders/${documentId}/update-status`, data),
    postAssignRider: (documentId, data) => authApi.post(`/sale-orders/${documentId}/assign-rider`, data),
};