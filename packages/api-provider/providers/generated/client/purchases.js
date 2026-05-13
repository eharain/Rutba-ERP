import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { PurchasesEndpoints as PurchasesEndpointsApi } from '../../../api/purchases.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', PurchasesEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', PurchasesEndpointsApi.byId(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', PurchasesEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', PurchasesEndpointsApi.update(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', PurchasesEndpointsApi.del(...args));
}

const endpoints = strictEndpointGuard(
    'PurchasesEndpoints',
    {
        list,
        byId,
        create,
        update,
        del,
        meta: PurchasesEndpointsApi.meta,
    },
    ["list","byId","create","update","del","meta"],
);

export default endpoints;
export const PurchasesEndpoints = endpoints;
