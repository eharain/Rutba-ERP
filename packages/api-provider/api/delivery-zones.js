export const DeliveryZonesEndpoints = {
    list: ({ sort, pagination } = {}) => ({
        path: '/delivery-zones',
        params: {
            sort: sort ?? ['createdAt:desc'],
            pagination: pagination ?? { pageSize: 200 },
        },
    }),
    create: (data) => ({ path: '/delivery-zones' , data }),

};