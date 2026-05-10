import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { SaleReturnItemsEndpoints } from '@/api/sale-return-items.js';

export default createClientProxy(SaleReturnItemsEndpoints, authApi);
export const SaleReturnItemsEndpointsProxy = createClientProxy(SaleReturnItemsEndpoints, authApi);
