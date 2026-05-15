export const ReturnRequestsEndpoints = {
    meta: { domains: ['web-user'] },

    create: (data) => ({ path: '/return-requests', method: 'post', data }),
};