import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { PurchaseItemsEndpoints as PurchaseItemsEndpointsApi } from '../api/purchase-items.js';

const endpoints = createClientProxy(PurchaseItemsEndpointsApi, authApi);

export default endpoints;
export const PurchaseItemsEndpoints = endpoints;

