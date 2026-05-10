import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { BrandsEndpoints as BrandsEndpointsApi } from '../api/brands.js';

const endpoints = createClientProxy(BrandsEndpointsApi, authApi);

export default endpoints;
export const BrandsEndpoints = endpoints;

