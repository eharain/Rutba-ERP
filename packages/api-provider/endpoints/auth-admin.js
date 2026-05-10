import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { AuthAdminEndpoints as AuthAdminEndpointsApi } from '../api/auth-admin.js';

const endpoints = createClientProxy(AuthAdminEndpointsApi, authApi);

export default endpoints;
export const AuthAdminEndpoints = endpoints;

