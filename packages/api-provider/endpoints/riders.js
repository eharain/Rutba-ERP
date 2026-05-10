import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { RidersEndpoints as RidersEndpointsApi } from '../api/riders.js';

const endpoints = createClientProxy(RidersEndpointsApi, authApi);

export default endpoints;
export const RidersEndpoints = endpoints;

