import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { SuppliersEndpoints as SuppliersEndpointsApi } from '../api/suppliers.js';

const endpoints = createClientProxy(SuppliersEndpointsApi, authApi);

export default endpoints;
export const SuppliersEndpoints = endpoints;

