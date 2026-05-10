import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { CategoriesEndpoints as CategoriesEndpointsApi } from '../api/categories.js';

const endpoints = createClientProxy(CategoriesEndpointsApi, authApi);

export default endpoints;
export const CategoriesEndpoints = endpoints;

