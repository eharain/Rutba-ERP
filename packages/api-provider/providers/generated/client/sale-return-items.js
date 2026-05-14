import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { SaleReturnItemsEndpoints as SaleReturnItemsEndpointsApi } from '../../../api/sale-return-items.js';

async function create(data) {
    const ep = SaleReturnItemsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function update(documentId, data) {
    const ep = SaleReturnItemsEndpointsApi.update(documentId, data);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'SaleReturnItemsEndpoints',
    {
        create,
        update,
        meta: SaleReturnItemsEndpointsApi.meta,
    },
    ["create","update","meta"],
);

export default endpoints;
export const SaleReturnItemsEndpoints = endpoints;
