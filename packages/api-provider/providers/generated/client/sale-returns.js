import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { SaleReturnsEndpoints as SaleReturnsEndpointsApi } from '../../../api/sale-returns.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', SaleReturnsEndpointsApi.list(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', SaleReturnsEndpointsApi.create(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', SaleReturnsEndpointsApi.byId(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', SaleReturnsEndpointsApi.update(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', SaleReturnsEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', SaleReturnsEndpointsApi.unpublish(...args));
}

const endpoints = strictEndpointGuard(
    'SaleReturnsEndpoints',
    {
        list,
        create,
        byId,
        update,
        publish,
        unpublish,
        meta: SaleReturnsEndpointsApi.meta,
    },
    ["list","create","byId","update","publish","unpublish","meta"],
);

export default endpoints;
export const SaleReturnsEndpoints = endpoints;
