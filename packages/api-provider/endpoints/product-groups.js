import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { ProductGroupsEndpoints as ProductGroupsEndpointsApi } from '../api/product-groups.js';

const endpoints = createClientProxy(ProductGroupsEndpointsApi, authApi);

export default endpoints;
export const ProductGroupsEndpoints = endpoints;

