import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { BrandGroupsEndpoints as BrandGroupsEndpointsApi } from '../api/brand-groups.js';

const endpoints = createClientProxy(BrandGroupsEndpointsApi, authApi);

export default endpoints;
export const BrandGroupsEndpoints = endpoints;

