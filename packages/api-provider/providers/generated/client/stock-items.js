import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { StockItemsEndpoints as StockItemsEndpointsApi } from '../../../api/stock-items.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', StockItemsEndpointsApi.list(...args));
}

async function listByProduct(...args) {
    return executeEndpoint(authApi, 'listByProduct', StockItemsEndpointsApi.listByProduct(...args));
}

async function listByBarcode(...args) {
    return executeEndpoint(authApi, 'listByBarcode', StockItemsEndpointsApi.listByBarcode(...args));
}

async function checkBarcode(...args) {
    return executeEndpoint(authApi, 'checkBarcode', StockItemsEndpointsApi.checkBarcode(...args));
}

async function orphanGroups(...args) {
    return executeEndpoint(authApi, 'orphanGroups', StockItemsEndpointsApi.orphanGroups(...args));
}

async function orphanGroupItems(...args) {
    return executeEndpoint(authApi, 'orphanGroupItems', StockItemsEndpointsApi.orphanGroupItems(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', StockItemsEndpointsApi.create(...args));
}

async function searchByBarcode(...args) {
    return executeEndpoint(authApi, 'searchByBarcode', StockItemsEndpointsApi.searchByBarcode(...args));
}

async function searchByName(...args) {
    return executeEndpoint(authApi, 'searchByName', StockItemsEndpointsApi.searchByName(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', StockItemsEndpointsApi.byId(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', StockItemsEndpointsApi.update(...args));
}

async function byProduct(...args) {
    return executeEndpoint(authApi, 'byProduct', StockItemsEndpointsApi.byProduct(...args));
}

async function transfer(...args) {
    return executeEndpoint(authApi, 'transfer', StockItemsEndpointsApi.transfer(...args));
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
