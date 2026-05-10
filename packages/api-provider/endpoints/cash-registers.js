import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { CashRegistersEndpoints as CashRegistersEndpointsApi } from '../api/cash-registers.js';

const endpoints = createClientProxy(CashRegistersEndpointsApi, authApi);

export default endpoints;
export const CashRegistersEndpoints = endpoints;

