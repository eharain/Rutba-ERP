import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { DeliveryZonesEndpoints } from '@/api/delivery-zones.js';

export default createClientProxy(DeliveryZonesEndpoints, authApi);
export const DeliveryZonesEndpointsProxy = createClientProxy(DeliveryZonesEndpoints, authApi);
