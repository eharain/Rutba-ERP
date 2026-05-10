import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { StockHelpersEndpoints } from '@/api/stock-helpers.js';

export default createClientProxy(StockHelpersEndpoints, authApi);
export const StockHelpersEndpointsProxy = createClientProxy(StockHelpersEndpoints, authApi);
