import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { MeAddressesEndpoints as MeAddressesEndpointsApi } from '../../../api/me-addresses.js';

async function list() {
    const ep = MeAddressesEndpointsApi.list();
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = MeAddressesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = MeAddressesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = MeAddressesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function makeDefault(documentId) {
    const ep = MeAddressesEndpointsApi.makeDefault(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'MeAddressesEndpoints',
    {
        list,
        create,
        update,
        del,
        makeDefault,
        meta: MeAddressesEndpointsApi.meta,
    },
    ["list","create","update","del","makeDefault","meta"],
);

export default endpoints;
export const MeAddressesEndpoints = endpoints;
