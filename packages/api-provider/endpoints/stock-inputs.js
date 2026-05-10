import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { StockInputsEndpoints } from '@/api/stock-inputs.js';

export default createClientProxy(StockInputsEndpoints, authApi);
export const StockInputsEndpointsProxy = createClientProxy(StockInputsEndpoints, authApi);
