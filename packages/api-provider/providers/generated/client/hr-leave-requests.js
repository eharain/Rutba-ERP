import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
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
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function action(documentId, action) {
    const ep = HrLeaveRequestsEndpointsApi.action(documentId, action);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'HrLeaveRequestsEndpoints',
    {
        myRequests,
        teamQueue,
        create,
        action,
        meta: HrLeaveRequestsEndpointsApi.meta,
    },
    ["myRequests","teamQueue","create","action","meta"],
);

export default endpoints;
export const HrLeaveRequestsEndpoints = endpoints;
