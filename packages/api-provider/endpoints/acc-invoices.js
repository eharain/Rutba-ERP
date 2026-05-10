import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { AccInvoicesEndpoints as AccInvoicesEndpointsApi } from '../api/acc-invoices.js';

const endpoints = createClientProxy(AccInvoicesEndpointsApi, authApi);

export default endpoints;
export const AccInvoicesEndpoints = endpoints;

