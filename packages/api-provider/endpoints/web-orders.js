import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { WebOrdersEndpoints as WebOrdersEndpointsApi } from '../api/web-orders.js';

const endpoints = createClientProxy(WebOrdersEndpointsApi, authApi);

export default endpoints;
export const WebOrdersEndpoints = endpoints;

