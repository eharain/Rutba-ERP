import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { DeliveryZonesEndpoints as DeliveryZonesEndpointsApi } from '../api/delivery-zones.js';

const endpoints = createClientProxy(DeliveryZonesEndpointsApi, authApi);

export default endpoints;
export const DeliveryZonesEndpoints = endpoints;

