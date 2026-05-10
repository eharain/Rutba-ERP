import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { SaleOrdersEndpoints as SaleOrdersEndpointsApi } from '../api/sale-orders.js';

const endpoints = createClientProxy(SaleOrdersEndpointsApi, authApi);

export default endpoints;
export const SaleOrdersEndpoints = endpoints;

