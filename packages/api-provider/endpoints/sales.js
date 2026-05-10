import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { SalesEndpoints as SalesEndpointsApi } from '../api/sales.js';

const endpoints = createClientProxy(SalesEndpointsApi, authApi);

export default endpoints;
export const SalesEndpoints = endpoints;

