import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
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

async function messages(...args) {
    return executeEndpoint(authApi, 'messages', SaleOrdersEndpointsApi.messages(...args));
}

async function sendMessage(...args) {
    return executeEndpoint(authApi, 'sendMessage', SaleOrdersEndpointsApi.sendMessage(...args));
}

const endpoints = strictEndpointGuard(
    'SaleOrdersEndpoints',
    {
        list,
        byId,
        create,
        update,
        updateStatus,
        assignRider,
        messages,
        sendMessage,
        meta: SaleOrdersEndpointsApi.meta,
    },
    ["list","byId","create","update","updateStatus","assignRider","messages","sendMessage","meta"],
);

export default endpoints;
export const SaleOrdersEndpoints = endpoints;
