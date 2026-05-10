import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { PaymentsEndpoints as PaymentsEndpointsApi } from '../api/payments.js';

const endpoints = createClientProxy(PaymentsEndpointsApi, authApi);

export default endpoints;
export const PaymentsEndpoints = endpoints;

