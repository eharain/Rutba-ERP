import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { SalesEndpoints as SalesEndpointsApi } from '../../../api/sales.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', SalesEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', SalesEndpointsApi.byId(...args));
}

async function exchangeReturns(...args) {
    return executeEndpoint(authApi, 'exchangeReturns', SalesEndpointsApi.exchangeReturns(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', SalesEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', SalesEndpointsApi.update(...args));
}

async function cancel(...args) {
    return executeEndpoint(authApi, 'cancel', SalesEndpointsApi.cancel(...args));
}

async function saveNotes(...args) {
    return executeEndpoint(authApi, 'saveNotes', SalesEndpointsApi.saveNotes(...args));
}

async function searchByStockItem(...args) {
    return executeEndpoint(authApi, 'searchByStockItem', SalesEndpointsApi.searchByStockItem(...args));
}

async function searchByItemPrice(...args) {
    return executeEndpoint(authApi, 'searchByItemPrice', SalesEndpointsApi.searchByItemPrice(...args));
}

async function sales(...args) {
    return executeEndpoint(authApi, 'sales', SalesEndpointsApi.sales(...args));
}

async function saleByIdOrInvoice(...args) {
    return executeEndpoint(authApi, 'saleByIdOrInvoice', SalesEndpointsApi.saleByIdOrInvoice(...args));
}

async function fetchList(...args) {
    return list(...args);
}

async function fetchById(...args) {
    return byId(...args);
}

async function postCreate(...args) {
    return create(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

async function fetchSearchByStockItem(...args) {
    return searchByStockItem(...args);
}

async function fetchSearchByItemPrice(...args) {
    return searchByItemPrice(...args);
}

const endpoints = {
    list,
    byId,
    exchangeReturns,
    create,
    update,
    cancel,
    saveNotes,
    searchByStockItem,
    searchByItemPrice,
    sales,
    saleByIdOrInvoice,
    fetchList,
    fetchById,
    postCreate,
    putUpdate,
    fetchSearchByStockItem,
    fetchSearchByItemPrice,
    meta: SalesEndpointsApi.meta,
};

export default endpoints;
export const SalesEndpoints = endpoints;
