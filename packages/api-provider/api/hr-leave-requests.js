export const HrLeaveRequestsEndpoints = {
    meta: { domains: ['hr'] },

    myRequests: () => ({ path: '/hr-leave-requests/my-requests' }),
    teamQueue: () => ({ path: '/hr-leave-requests/team-queue' }),
    create: (data) => ({ path: '/hr-leave-requests', method: 'post', data }),
    action: (documentId, action) => ({ path: `/hr-leave-requests/${documentId}/${action}`, method: 'post' }),

};