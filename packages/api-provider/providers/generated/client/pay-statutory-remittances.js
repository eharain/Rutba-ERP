import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { PayStatutoryRemittancesEndpoints as PayStatutoryRemittancesEndpointsApi } from '../../../api/pay-statutory-remittances.js';

async function list(arg1 = {}) {
    const ep = PayStatutoryRemittancesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = PayStatutoryRemittancesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = PayStatutoryRemittancesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = PayStatutoryRemittancesEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function del(documentId) {
    const ep = PayStatutoryRemittancesEndpointsApi.del(documentId);
    return authApi.del(withQuery(ep.path, ep.params));
}

async function process(documentId, extra = {}) {
    const ep = PayStatutoryRemittancesEndpointsApi.process(documentId, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'PayStatutoryRemittancesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        process,
        meta: PayStatutoryRemittancesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","process","meta"],
);

export default endpoints;
export const PayStatutoryRemittancesEndpoints = endpoints;
