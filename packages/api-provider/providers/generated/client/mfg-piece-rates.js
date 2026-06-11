import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { MfgPieceRatesEndpoints as MfgPieceRatesEndpointsApi } from '../../../api/mfg-piece-rates.js';

async function list(page = 1, pageSize = 20, arg3 = {}) {
    const ep = MfgPieceRatesEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = MfgPieceRatesEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function byOperation(operationDocId, arg2 = {}) {
    const ep = MfgPieceRatesEndpointsApi.byOperation(operationDocId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = MfgPieceRatesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = MfgPieceRatesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = MfgPieceRatesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'MfgPieceRatesEndpoints',
    {
        list,
        byId,
        byOperation,
        create,
        update,
        del,
        meta: MfgPieceRatesEndpointsApi.meta,
    },
    ["list","byId","byOperation","create","update","del","meta"],
);

export default endpoints;
export const MfgPieceRatesEndpoints = endpoints;
