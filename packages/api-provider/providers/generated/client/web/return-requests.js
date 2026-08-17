import { webApi } from '../../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from '../___core__.js';
import { WebReturnRequestsEndpoints as WebReturnRequestsEndpointsApi } from '../../../../api/web/return-requests.js';

async function createReturnRequest(data) {
    const ep = WebReturnRequestsEndpointsApi.createReturnRequest(data);
    return webApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function listMine() {
    const ep = WebReturnRequestsEndpointsApi.listMine();
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function byId(documentId) {
    const ep = WebReturnRequestsEndpointsApi.byId(documentId);
    return webApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function cancelMine(documentId) {
    const ep = WebReturnRequestsEndpointsApi.cancelMine(documentId);
    return webApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'WebReturnRequestsEndpoints',
    {
        createReturnRequest,
        listMine,
        byId,
        cancelMine,
    },
    ["createReturnRequest","listMine","byId","cancelMine"],
);

export default endpoints;
export const WebReturnRequestsEndpoints = endpoints;
