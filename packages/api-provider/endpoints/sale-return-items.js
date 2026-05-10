import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { SaleReturnItemsEndpoints as SaleReturnItemsEndpointsApi } from '../api/sale-return-items.js';

const endpoints = createClientProxy(SaleReturnItemsEndpointsApi, authApi);

export default endpoints;
export const SaleReturnItemsEndpoints = endpoints;

