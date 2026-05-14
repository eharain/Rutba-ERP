import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { DeliveryZonesEndpoints as DeliveryZonesEndpointsApi } from '../../../api/delivery-zones.js';

async function list(arg1 = {}) {
    const ep = DeliveryZonesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = DeliveryZonesEndpointsApi.create(data);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'DeliveryZonesEndpoints',
    {
        list,
        create,
        meta: DeliveryZonesEndpointsApi.meta,
    },
    ["list","create","meta"],
);

export default endpoints;
export const DeliveryZonesEndpoints = endpoints;
