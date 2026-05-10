import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { AccAccountsEndpoints as AccAccountsEndpointsApi } from '../api/acc-accounts.js';

const endpoints = createClientProxy(AccAccountsEndpointsApi, authApi);

export default endpoints;
export const AccAccountsEndpoints = endpoints;
