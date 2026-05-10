import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { BrandGroupsEndpoints } from '@/api/brand-groups.js';

export default createClientProxy(BrandGroupsEndpoints, authApi);
export const BrandGroupsEndpointsProxy = createClientProxy(BrandGroupsEndpoints, authApi);
