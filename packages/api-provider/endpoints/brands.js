import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { BrandsEndpoints } from '@/api/brands.js';

export default createClientProxy(BrandsEndpoints, authApi);
export const BrandsEndpointsProxy = createClientProxy(BrandsEndpoints, authApi);
