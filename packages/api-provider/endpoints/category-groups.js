import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { CategoryGroupsEndpoints as CategoryGroupsEndpointsApi } from '../api/category-groups.js';

const endpoints = createClientProxy(CategoryGroupsEndpointsApi, authApi);

export default endpoints;
export const CategoryGroupsEndpoints = endpoints;

