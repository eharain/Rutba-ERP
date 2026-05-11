import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { SaleOrdersEndpoints as SaleOrdersEndpointsApi } from '../../../api/sale-orders.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', SaleOrdersEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', SaleOrdersEndpointsApi.byId(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', SaleOrdersEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', SaleOrdersEndpointsApi.update(...args));
}

async function updateStatus(...args) {
    return executeEndpoint(authApi, 'updateStatus', SaleOrdersEndpointsApi.updateStatus(...args));
}

async function assignRider(...args) {
    return executeEndpoint(authApi, 'assignRider', SaleOrdersEndpointsApi.assignRider(...args));
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

const endpoints = {
    list,
    byId,
    create,
    update,
    updateStatus,
    assignRider,
    fetchList,
    fetchById,
    postCreate,
    putUpdate,
    meta: SaleOrdersEndpointsApi.meta,
};

export default endpoints;
export const SaleOrdersEndpoints = endpoints;
