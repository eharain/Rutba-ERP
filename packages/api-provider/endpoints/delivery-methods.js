import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { DeliveryMethodsEndpoints as DeliveryMethodsEndpointsApi } from '../api/delivery-methods.js';

const endpoints = createClientProxy(DeliveryMethodsEndpointsApi, authApi);

export default endpoints;
export const DeliveryMethodsEndpoints = endpoints;

