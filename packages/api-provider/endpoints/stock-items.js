import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { StockItemsEndpoints as StockItemsEndpointsApi } from '../api/stock-items.js';

const endpoints = createClientProxy(StockItemsEndpointsApi, authApi);

export default endpoints;
export const StockItemsEndpoints = endpoints;

