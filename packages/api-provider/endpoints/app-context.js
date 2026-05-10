import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { AppContextEndpoints as AppContextEndpointsApi } from '../api/app-context.js';

const endpoints = createClientProxy(AppContextEndpointsApi, authApi);

export default endpoints;
export const AppContextEndpoints = endpoints;

