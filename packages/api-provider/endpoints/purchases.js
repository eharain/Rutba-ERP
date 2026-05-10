import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { PurchasesEndpoints } from '@/api/purchases.js';

export default createClientProxy(PurchasesEndpoints, authApi);
export const PurchasesEndpointsProxy = createClientProxy(PurchasesEndpoints, authApi);
