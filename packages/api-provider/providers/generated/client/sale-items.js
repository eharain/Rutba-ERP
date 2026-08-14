import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, epCtx, strictEndpointGuard } from './___core__.js';
import { SaleItemsEndpoints as SaleItemsEndpointsApi } from '../../../api/sale-items.js';

async function create(data) {
    const ep = SaleItemsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function update(documentId, data) {
    const ep = SaleItemsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function disconnect(documentId) {
    const ep = SaleItemsEndpointsApi.disconnect(documentId);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data), epCtx(ep));
}

async function saveSaleItems(saleId, items) {
    const ep = SaleItemsEndpointsApi.saveSaleItems(saleId, items);
    return authApi.fetch(ep.path, ep.params, epCtx(ep));
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
