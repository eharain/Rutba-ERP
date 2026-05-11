import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
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

async function postCreate(...args) {
    return create(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

const endpoints = {
    create,
    update,
    disconnect,
    postCreate,
    putUpdate,
    meta: SaleItemsEndpointsApi.meta,
};

export default endpoints;
export const SaleItemsEndpoints = endpoints;
