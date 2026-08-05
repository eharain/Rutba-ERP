import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrAssetsEndpoints as HrAssetsEndpointsApi } from '../../../api/hr-assets.js';

async function list(arg1 = {}) {
    const ep = HrAssetsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrAssetsEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrAssetsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrAssetsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function assign(documentId, data) {
    const ep = HrAssetsEndpointsApi.assign(documentId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'HrAssetsEndpoints',
    {
        list,
        byId,
        create,
        update,
        assign,
        meta: HrAssetsEndpointsApi.meta,
    },
    ["list","byId","create","update","assign","meta"],
);

export default endpoints;
export const HrAssetsEndpoints = endpoints;
