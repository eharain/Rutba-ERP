import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { SaleItemsEndpoints } from '@/api/sale-items.js';

export default createClientProxy(SaleItemsEndpoints, authApi);
export const SaleItemsEndpointsProxy = createClientProxy(SaleItemsEndpoints, authApi);
