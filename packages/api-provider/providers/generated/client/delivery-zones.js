import { authApi } from '../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from './___core__.js';
import { DeliveryZonesEndpoints as DeliveryZonesEndpointsApi } from '../../../api/delivery-zones.js';

async function list(arg1 = {}) {
    const ep = DeliveryZonesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

async function create(data) {
    const ep = DeliveryZonesEndpointsApi.create(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
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
