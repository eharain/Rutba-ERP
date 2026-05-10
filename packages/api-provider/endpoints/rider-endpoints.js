import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { RiderEndpoints as RiderEndpointsApi } from '../api/rider-endpoints.js';

const endpoints = createClientProxy(RiderEndpointsApi, authApi);

export default endpoints;
export const RiderEndpoints = endpoints;

