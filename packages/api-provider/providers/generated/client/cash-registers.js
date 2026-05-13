import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { CashRegistersEndpoints as CashRegistersEndpointsApi } from '../../../api/cash-registers.js';

async function list(arg1 = {}) {
    const ep = CashRegistersEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(documentId, arg2 = {}) {
    const ep = CashRegistersEndpointsApi.byId(documentId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function active(arg1 = {}) {
    const ep = CashRegistersEndpointsApi.active(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function fetchActive(arg1 = {}) {
    const ep = CashRegistersEndpointsApi.fetchActive(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function open(data) {
    const ep = CashRegistersEndpointsApi.open(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function postOpen(data) {
    const ep = CashRegistersEndpointsApi.postOpen(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function close(registerId) {
    const ep = CashRegistersEndpointsApi.close(registerId);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function postClose(registerId, data) {
    const ep = CashRegistersEndpointsApi.postClose(registerId, data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'CashRegistersEndpoints',
    {
        list,
        byId,
        active,
        fetchActive,
        open,
        postOpen,
        close,
        postClose,
        meta: CashRegistersEndpointsApi.meta,
    },
    ["list","byId","active","fetchActive","open","postOpen","close","postClose","meta"],
);

export default endpoints;
export const CashRegistersEndpoints = endpoints;
