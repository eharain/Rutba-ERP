import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { SaleOffersEndpoints } from '@/api/sale-offers.js';

export default createClientProxy(SaleOffersEndpoints, authApi);
export const SaleOffersEndpointsProxy = createClientProxy(SaleOffersEndpoints, authApi);
