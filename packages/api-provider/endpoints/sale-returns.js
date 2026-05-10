import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { SaleReturnsEndpoints as SaleReturnsEndpointsApi } from '../api/sale-returns.js';

const endpoints = createClientProxy(SaleReturnsEndpointsApi, authApi);

export default endpoints;
export const SaleReturnsEndpoints = endpoints;

