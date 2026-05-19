import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { StockItemsEndpoints as StockItemsEndpointsApi } from '../../../api/stock-items.js';

async function list(page = 1, pageSize = 20, arg3 = {}) {
    const ep = StockItemsEndpointsApi.list(page, pageSize, arg3);
    return authApi.fetch(ep.path, ep.params);
}

async function listByProduct(productDocId, arg2 = {}) {
    const ep = StockItemsEndpointsApi.listByProduct(productDocId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function listByBarcode(barcode, arg2 = {}) {
    const ep = StockItemsEndpointsApi.listByBarcode(barcode, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function checkBarcode(barcode) {
    const ep = StockItemsEndpointsApi.checkBarcode(barcode);
    return authApi.fetch(ep.path, ep.params);
}

async function orphanGroups(arg1 = {}) {
    const ep = StockItemsEndpointsApi.orphanGroups(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function orphanGroupItems(arg1 = {}) {
    const ep = StockItemsEndpointsApi.orphanGroupItems(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = StockItemsEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function searchByBarcode(barcode) {
    const ep = StockItemsEndpointsApi.searchByBarcode(barcode);
    return authApi.fetch(ep.path, ep.params);
}

async function searchByName(name) {
    const ep = StockItemsEndpointsApi.searchByName(name);
    return authApi.fetch(ep.path, ep.params);
}

async function byId(id, arg2 = {}) {
    const ep = StockItemsEndpointsApi.byId(id, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function update(documentId, data) {
    const ep = StockItemsEndpointsApi.update(documentId, data);
    return authApi.put(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function byProduct(productDocId, arg2 = {}) {
    const ep = StockItemsEndpointsApi.byProduct(productDocId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

async function transfer(payload = {}) {
    const ep = StockItemsEndpointsApi.transfer(payload);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'StockItemsEndpoints',
    {
        list,
        listByProduct,
        listByBarcode,
        checkBarcode,
        orphanGroups,
        orphanGroupItems,
        create,
        searchByBarcode,
        searchByName,
        byId,
        update,
        byProduct,
        transfer,
        meta: StockItemsEndpointsApi.meta,
    },
    ["list","listByProduct","listByBarcode","checkBarcode","orphanGroups","orphanGroupItems","create","searchByBarcode","searchByName","byId","update","byProduct","transfer","meta"],
);

export default endpoints;
export const StockItemsEndpoints = endpoints;
