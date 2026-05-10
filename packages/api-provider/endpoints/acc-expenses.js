import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { AccExpensesEndpoints as AccExpensesEndpointsApi } from '../api/acc-expenses.js';

const endpoints = createClientProxy(AccExpensesEndpointsApi, authApi);

export default endpoints;
export const AccExpensesEndpoints = endpoints;

