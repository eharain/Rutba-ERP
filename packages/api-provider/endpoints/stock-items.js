import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { StockItemsEndpoints } from '@/api/stock-items.js';

export default createClientProxy(StockItemsEndpoints, authApi);
export const StockItemsEndpointsProxy = createClientProxy(StockItemsEndpoints, authApi);
