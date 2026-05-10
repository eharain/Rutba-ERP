import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { CashRegisterTransactionEndpoints as CashRegisterTransactionEndpointsApi } from '../api/cash-register-transactions.js';

const endpoints = createClientProxy(CashRegisterTransactionEndpointsApi, authApi);

export default endpoints;
export const CashRegisterTransactionEndpoints = endpoints;

