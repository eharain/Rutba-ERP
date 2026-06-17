import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrLeaveRequestsEndpoints as HrLeaveRequestsEndpointsApi } from '../../../api/hr-leave-requests.js';

async function list(arg1 = {}) {
    const ep = HrLeaveRequestsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrLeaveRequestsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function listMyRequests() {
    const ep = HrLeaveRequestsEndpointsApi.listMyRequests();
    return authApi.fetch(ep.path, ep.params);
}

async function listTeamQueue() {
    const ep = HrLeaveRequestsEndpointsApi.listTeamQueue();
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrLeaveRequestsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrLeaveRequestsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function approve(documentId, extra = {}) {
    const ep = HrLeaveRequestsEndpointsApi.approve(documentId, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function reject(documentId, extra = {}) {
    const ep = HrLeaveRequestsEndpointsApi.reject(documentId, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function cancel(documentId, extra = {}) {
    const ep = HrLeaveRequestsEndpointsApi.cancel(documentId, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'HrLeaveRequestsEndpoints',
    {
        list,
        byId,
        listMyRequests,
        listTeamQueue,
        create,
        update,
        approve,
        reject,
        cancel,
        meta: HrLeaveRequestsEndpointsApi.meta,
    },
    ["list","byId","listMyRequests","listTeamQueue","create","update","approve","reject","cancel","meta"],
);

export default endpoints;
export const HrLeaveRequestsEndpoints = endpoints;
