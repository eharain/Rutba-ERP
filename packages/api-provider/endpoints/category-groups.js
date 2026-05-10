import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { CategoryGroupsEndpoints } from '@/api/category-groups.js';

export default createClientProxy(CategoryGroupsEndpoints, authApi);
export const CategoryGroupsEndpointsProxy = createClientProxy(CategoryGroupsEndpoints, authApi);
