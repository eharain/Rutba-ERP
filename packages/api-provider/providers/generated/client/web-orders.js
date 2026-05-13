import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { WebOrdersEndpoints as WebOrdersEndpointsApi } from '../../../api/web-orders.js';

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', WebOrdersEndpointsApi.byId(...args));
}

const endpoints = strictEndpointGuard(
    'WebOrdersEndpoints',
    {
        byId,
    },
    ["byId"],
);

export default endpoints;
export const WebOrdersEndpoints = endpoints;
