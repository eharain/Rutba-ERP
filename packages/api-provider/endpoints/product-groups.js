import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { ProductGroupsEndpoints } from '@/api/product-groups.js';

export default createClientProxy(ProductGroupsEndpoints, authApi);
export const ProductGroupsEndpointsProxy = createClientProxy(ProductGroupsEndpoints, authApi);
