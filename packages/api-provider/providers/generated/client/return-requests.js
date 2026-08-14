import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { ReturnRequestsEndpoints as ReturnRequestsEndpointsApi } from '../../../api/return-requests.js';

async function createReturnRequest(data) {
    const ep = ReturnRequestsEndpointsApi.createReturnRequest(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function list(arg1 = {}) {
    const ep = ReturnRequestsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId, arg2 = {}) {
    const ep = ReturnRequestsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function approveReturn(documentId, data) {
    const ep = ReturnRequestsEndpointsApi.approveReturn(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function rejectReturn(documentId, data) {
    const ep = ReturnRequestsEndpointsApi.rejectReturn(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function cancelReturn(documentId, data) {
    const ep = ReturnRequestsEndpointsApi.cancelReturn(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function setReceived(documentId, data) {
    const ep = ReturnRequestsEndpointsApi.setReceived(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function resolveReturn(documentId, data) {
    const ep = ReturnRequestsEndpointsApi.resolveReturn(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function getReturnLabel(documentId, arg2 = {}) {
    const ep = ReturnRequestsEndpointsApi.getReturnLabel(documentId, arg2);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'ReturnRequestsEndpoints',
    {
        createReturnRequest,
        list,
        byId,
        approveReturn,
        rejectReturn,
        cancelReturn,
        setReceived,
        resolveReturn,
        getReturnLabel,
        meta: ReturnRequestsEndpointsApi.meta,
    },
    ["createReturnRequest","list","byId","approveReturn","rejectReturn","cancelReturn","setReceived","resolveReturn","getReturnLabel","meta"],
);

export default endpoints;
export const ReturnRequestsEndpoints = endpoints;
