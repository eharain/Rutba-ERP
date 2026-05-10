import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { StockHelpersEndpoints as StockHelpersEndpointsApi } from '../api/stock-helpers.js';

const endpoints = createClientProxy(StockHelpersEndpointsApi, authApi);

export default endpoints;
export const StockHelpersEndpoints = endpoints;

