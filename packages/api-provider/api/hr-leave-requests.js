export const HrLeaveRequestsEndpoints = {
    myRequests: () => ({ path: '/hr-leave-requests/my-requests' }),
    teamQueue: () => ({ path: '/hr-leave-requests/team-queue' }),
    create: () => ({ path: '/hr-leave-requests' }),
    action: (documentId, action) => ({ path: `/hr-leave-requests/${documentId}/${action}` }),

    fetchMyRequests: () => {
        const ep = HrLeaveRequestsEndpoints.myRequests();
        return authApi.fetch(ep.path, ep.params);
    },

    fetchTeamQueue: () => {
        const ep = HrLeaveRequestsEndpoints.teamQueue();
        return authApi.fetch(ep.path, ep.params);
    },

    postCreate: (data) => authApi.post('/hr-leave-requests', { data }),

    postAction: (documentId, action, data = {}) => {
        const ep = HrLeaveRequestsEndpoints.action(documentId, action);
        return authApi.post(ep.path, data);
    },
};