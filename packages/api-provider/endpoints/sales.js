import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { SalesEndpoints } from '@/api/sales.js';

export default createClientProxy(SalesEndpoints, authApi);
export const SalesEndpointsProxy = createClientProxy(SalesEndpoints, authApi);
