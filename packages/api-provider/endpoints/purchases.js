import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { PurchasesEndpoints as PurchasesEndpointsApi } from '../api/purchases.js';

const endpoints = createClientProxy(PurchasesEndpointsApi, authApi);

export default endpoints;
export const PurchasesEndpoints = endpoints;

