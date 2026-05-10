import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { CategoriesEndpoints } from '@/api/categories.js';

export default createClientProxy(CategoriesEndpoints, authApi);
export const CategoriesEndpointsProxy = createClientProxy(CategoriesEndpoints, authApi);
