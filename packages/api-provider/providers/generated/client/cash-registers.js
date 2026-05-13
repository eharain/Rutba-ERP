import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { CashRegistersEndpoints as CashRegistersEndpointsApi } from '../../../api/cash-registers.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', CashRegistersEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', CashRegistersEndpointsApi.byId(...args));
}

async function active(...args) {
    return executeEndpoint(authApi, 'active', CashRegistersEndpointsApi.active(...args));
}

async function fetchActive(...args) {
    return executeEndpoint(authApi, 'fetchActive', CashRegistersEndpointsApi.fetchActive(...args));
}

async function open(...args) {
    return executeEndpoint(authApi, 'open', CashRegistersEndpointsApi.open(...args));
}

async function postOpen(...args) {
    return executeEndpoint(authApi, 'postOpen', CashRegistersEndpointsApi.postOpen(...args));
}

async function close(...args) {
    return executeEndpoint(authApi, 'close', CashRegistersEndpointsApi.close(...args));
}

async function postClose(...args) {
    return executeEndpoint(authApi, 'postClose', CashRegistersEndpointsApi.postClose(...args));
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
