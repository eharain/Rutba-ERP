import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { HrOffersEndpoints as HrOffersEndpointsApi } from '../../../api/hr-offers.js';

async function list(arg1 = {}) {
    const ep = HrOffersEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = HrOffersEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = HrOffersEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = HrOffersEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = HrOffersEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

const endpoints = strictEndpointGuard(
    'HrOffersEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: HrOffersEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const HrOffersEndpoints = endpoints;
