import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { PurchaseItemsEndpoints } from '@/api/purchase-items.js';

export default createClientProxy(PurchaseItemsEndpoints, authApi);
export const PurchaseItemsEndpointsProxy = createClientProxy(PurchaseItemsEndpoints, authApi);
