import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { WebOrdersEndpoints as WebOrdersEndpointsApi } from '../../../api/web-orders.js';

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', WebOrdersEndpointsApi.byId(...args));
}

async function fetchById(...args) {
    return byId(...args);
}

const endpoints = {
    byId,
    fetchById,
};

export default endpoints;
export const WebOrdersEndpoints = endpoints;
