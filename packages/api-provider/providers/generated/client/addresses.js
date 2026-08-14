import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { AddressesEndpoints as AddressesEndpointsApi } from '../../../api/addresses.js';

async function list() {
    const ep = AddressesEndpointsApi.list();
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
}

async function create(data) {
    const ep = AddressesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = AddressesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function del(documentId) {
    const ep = AddressesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params), epCtx(ep));
}

async function makeDefault(documentId) {
    const ep = AddressesEndpointsApi.makeDefault(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'AddressesEndpoints',
    {
        list,
        create,
        update,
        del,
        makeDefault,
        meta: AddressesEndpointsApi.meta,
    },
    ["list","create","update","del","makeDefault","meta"],
);

export default endpoints;
export const AddressesEndpoints = endpoints;
