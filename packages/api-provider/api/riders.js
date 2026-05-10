export const RidersEndpoints = {
    list: ({ sort, populate, pagination, fields } = {}) => ({
        path: '/riders',
        params: {
            sort: sort ?? ['createdAt:desc'],
            populate: populate ?? ['assigned_zones', 'user'],
            pagination: pagination ?? { pageSize: 200 },
            ...(fields ? { fields } : {}),
        },
    }),
    create: (data) => ({ path: '/riders' , data }),
    update: (documentId, data) => ({ path: `/riders/${documentId}` , data }),

};