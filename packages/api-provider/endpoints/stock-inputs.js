import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { StockInputsEndpoints as StockInputsEndpointsApi } from '../api/stock-inputs.js';

const endpoints = createClientProxy(StockInputsEndpointsApi, authApi);

export default endpoints;
export const StockInputsEndpoints = endpoints;

