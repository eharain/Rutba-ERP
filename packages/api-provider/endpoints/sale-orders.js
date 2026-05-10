import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { SaleOrdersEndpoints } from '@/api/sale-orders.js';

export default createClientProxy(SaleOrdersEndpoints, authApi);
export const SaleOrdersEndpointsProxy = createClientProxy(SaleOrdersEndpoints, authApi);
