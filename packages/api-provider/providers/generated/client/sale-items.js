import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { SaleItemsEndpoints as SaleItemsEndpointsApi } from '../../../api/sale-items.js';

async function create(...args) {
    return executeEndpoint(authApi, 'create', SaleItemsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', SaleItemsEndpointsApi.update(...args));
}

async function disconnect(...args) {
    return executeEndpoint(authApi, 'disconnect', SaleItemsEndpointsApi.disconnect(...args));
}

async function saveSaleItems(...args) {
    return executeEndpoint(authApi, 'saveSaleItems', SaleItemsEndpointsApi.saveSaleItems(...args));
}

const endpoints = strictEndpointGuard(
    'SaleItemsEndpoints',
    {
        create,
        update,
        disconnect,
        saveSaleItems,
        meta: SaleItemsEndpointsApi.meta,
    },
    ["create","update","disconnect","saveSaleItems","meta"],
);

export default endpoints;
export const SaleItemsEndpoints = endpoints;
