import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { WebOrdersEndpoints as WebOrdersEndpointsApi } from '../../../api/web-orders.js';

async function byId(orderId, arg2 = {}) {
    const ep = WebOrdersEndpointsApi.byId(orderId, arg2);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'WebOrdersEndpoints',
    {
        byId,
        meta: WebOrdersEndpointsApi.meta,
    },
    ["byId","meta"],
);

export default endpoints;
export const WebOrdersEndpoints = endpoints;
