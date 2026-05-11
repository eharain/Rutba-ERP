import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { SaleReturnItemsEndpoints as SaleReturnItemsEndpointsApi } from '../../../api/sale-return-items.js';

async function create(...args) {
    return executeEndpoint(authApi, 'create', SaleReturnItemsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', SaleReturnItemsEndpointsApi.update(...args));
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
    postCreate,
    putUpdate,
};

export default endpoints;
export const SaleReturnItemsEndpoints = endpoints;
