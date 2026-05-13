import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { RidersEndpoints as RidersEndpointsApi } from '../../../api/riders.js';

async function list(arg1 = {}) {
    const ep = RidersEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = RidersEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = RidersEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'RidersEndpoints',
    {
        list,
        create,
        update,
        meta: RidersEndpointsApi.meta,
    },
    ["list","create","update","meta"],
);

export default endpoints;
export const RidersEndpoints = endpoints;
