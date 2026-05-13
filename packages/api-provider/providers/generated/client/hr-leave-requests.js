import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { HrLeaveRequestsEndpoints as HrLeaveRequestsEndpointsApi } from '../../../api/hr-leave-requests.js';

async function myRequests() {
    const ep = HrLeaveRequestsEndpointsApi.myRequests();
    return authApi.fetch(ep.path, ep.params);
}

async function teamQueue() {
    const ep = HrLeaveRequestsEndpointsApi.teamQueue();
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrLeaveRequestsEndpointsApi.create(data);
    return authApi.fetch(ep.path, ep.params);
}

async function action(documentId, action) {
    const ep = HrLeaveRequestsEndpointsApi.action(documentId, action);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'HrLeaveRequestsEndpoints',
    {
        myRequests,
        teamQueue,
        create,
        action,
    },
    ["myRequests","teamQueue","create","action"],
);

export default endpoints;
export const HrLeaveRequestsEndpoints = endpoints;
