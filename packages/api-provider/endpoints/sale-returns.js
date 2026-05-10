import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { SaleReturnsEndpoints } from '@/api/sale-returns.js';

export default createClientProxy(SaleReturnsEndpoints, authApi);
export const SaleReturnsEndpointsProxy = createClientProxy(SaleReturnsEndpoints, authApi);
