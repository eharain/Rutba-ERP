import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { DeliveryMethodsEndpoints } from '@/api/delivery-methods.js';

export default createClientProxy(DeliveryMethodsEndpoints, authApi);
export const DeliveryMethodsEndpointsProxy = createClientProxy(DeliveryMethodsEndpoints, authApi);
