import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { PayAdvancesEndpoints as PayAdvancesEndpointsApi } from '../../../api/pay-advances.js';

async function listMine() {
    const ep = PayAdvancesEndpointsApi.listMine();
    return authApi.fetch(ep.path, ep.params);
}

async function request(data) {
    const ep = PayAdvancesEndpointsApi.request(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function listTeam() {
    const ep = PayAdvancesEndpointsApi.listTeam();
    return authApi.fetch(ep.path, ep.params);
}

async function approve(documentId) {
    const ep = PayAdvancesEndpointsApi.approve(documentId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function reject(documentId, extra = {}) {
    const ep = PayAdvancesEndpointsApi.reject(documentId, extra);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function list(arg1 = {}) {
    const ep = PayAdvancesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = PayAdvancesEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'PayAdvancesEndpoints',
    {
        listMine,
        request,
        listTeam,
        approve,
        reject,
        list,
        byId,
        meta: PayAdvancesEndpointsApi.meta,
    },
    ["listMine","request","listTeam","approve","reject","list","byId","meta"],
);

export default endpoints;
export const PayAdvancesEndpoints = endpoints;
