import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { SuppliersEndpoints } from '@/api/suppliers.js';

export default createClientProxy(SuppliersEndpoints, authApi);
export const SuppliersEndpointsProxy = createClientProxy(SuppliersEndpoints, authApi);
