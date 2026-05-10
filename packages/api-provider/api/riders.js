export const RidersEndpoints = {
    meta: {
        uid: 'api::rider.rider',
        domains: ['rider', 'delivery'],
        roles: ['admin', 'manager', 'staff']
    },

    list: ({ sort, populate, pagination, fields } = {}) => ({
        path: '/riders',
        action: 'find',
        method: 'get',
        apps: ['rider', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['createdAt:desc'],
            populate: populate ?? ['assigned_zones', 'user'],
            pagination: pagination ?? { pageSize: 200 },
            ...(fields ? { fields } : {}),
        },
    }),
    create: (data) => ({
        path: '/riders',
        action: 'create',
        method: 'post',
        apps: ['rider', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),
    update: (documentId, data) => ({
        path: `/riders/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['rider', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

};