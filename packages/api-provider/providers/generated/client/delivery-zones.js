import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { DeliveryZonesEndpoints as DeliveryZonesEndpointsApi } from '../../../api/delivery-zones.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', DeliveryZonesEndpointsApi.list(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', DeliveryZonesEndpointsApi.create(...args));
}

const endpoints = strictEndpointGuard(
    'DeliveryZonesEndpoints',
    {
        list,
        create,
    },
    ["list","create"],
);

export default endpoints;
export const DeliveryZonesEndpoints = endpoints;
