import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { SaleItemsEndpoints as SaleItemsEndpointsApi } from '../api/sale-items.js';

const endpoints = createClientProxy(SaleItemsEndpointsApi, authApi);

export default endpoints;
export const SaleItemsEndpoints = endpoints;

