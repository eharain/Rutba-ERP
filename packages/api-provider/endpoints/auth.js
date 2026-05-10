import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { AuthEndpoints as AuthEndpointsApi } from '../api/auth.js';

const endpoints = createClientProxy(AuthEndpointsApi, authApi);

export default endpoints;
export const AuthEndpoints = endpoints;

