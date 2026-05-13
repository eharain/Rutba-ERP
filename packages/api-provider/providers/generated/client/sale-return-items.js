import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { SaleReturnItemsEndpoints as SaleReturnItemsEndpointsApi } from '../../../api/sale-return-items.js';

async function create(...args) {
    return executeEndpoint(authApi, 'create', SaleReturnItemsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', SaleReturnItemsEndpointsApi.update(...args));
}

const endpoints = strictEndpointGuard(
    'SaleReturnItemsEndpoints',
    {
        create,
        update,
    },
    ["create","update"],
);

export default endpoints;
export const SaleReturnItemsEndpoints = endpoints;
