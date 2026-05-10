import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { ReturnRequestsEndpoints as ReturnRequestsEndpointsApi } from '../api/return-requests.js';

const endpoints = createClientProxy(ReturnRequestsEndpointsApi, authApi);

export default endpoints;
export const ReturnRequestsEndpoints = endpoints;

