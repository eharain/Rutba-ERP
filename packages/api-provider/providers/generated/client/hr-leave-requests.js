import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { HrLeaveRequestsEndpoints as HrLeaveRequestsEndpointsApi } from '../../../api/hr-leave-requests.js';

async function myRequests(...args) {
    return executeEndpoint(authApi, 'myRequests', HrLeaveRequestsEndpointsApi.myRequests(...args));
}

async function teamQueue(...args) {
    return executeEndpoint(authApi, 'teamQueue', HrLeaveRequestsEndpointsApi.teamQueue(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', HrLeaveRequestsEndpointsApi.create(...args));
}

async function action(...args) {
    return executeEndpoint(authApi, 'action', HrLeaveRequestsEndpointsApi.action(...args));
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
