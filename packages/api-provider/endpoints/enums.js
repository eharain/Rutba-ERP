import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { EnumsEndpoints as EnumsEndpointsApi } from '../api/enums.js';

const endpoints = createClientProxy(EnumsEndpointsApi, authApi);

export default endpoints;
export const EnumsEndpoints = endpoints;

