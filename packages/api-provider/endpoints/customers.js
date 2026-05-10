import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { CustomersEndpoints as CustomersEndpointsApi } from '../api/customers.js';

const endpoints = createClientProxy(CustomersEndpointsApi, authApi);

export default endpoints;
export const CustomersEndpoints = endpoints;

