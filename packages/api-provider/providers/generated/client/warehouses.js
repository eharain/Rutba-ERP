import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { WarehousesEndpoints as WarehousesEndpointsApi } from '../../../api/warehouses.js';

async function list(page = 1, pageSize = 100, arg3 = {}) {
    const ep = WarehousesEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId) {
    const ep = WarehousesEndpointsApi.byId(documentId);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = WarehousesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = WarehousesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = WarehousesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function backfillDefaultLocations() {
    const ep = WarehousesEndpointsApi.backfillDefaultLocations();
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'WarehousesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        backfillDefaultLocations,
        meta: WarehousesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","backfillDefaultLocations","meta"],
);

export default endpoints;
export const WarehousesEndpoints = endpoints;
