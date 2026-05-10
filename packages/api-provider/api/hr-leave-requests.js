export const HrLeaveRequestsEndpoints = {
    myRequests: () => ({ path: '/hr-leave-requests/my-requests' }),
    teamQueue: () => ({ path: '/hr-leave-requests/team-queue' }),
    create: (data) => ({ path: '/hr-leave-requests' , data }),
    action: (documentId, action) => ({ path: `/hr-leave-requests/${documentId}/${action}` }),

};