import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { AuthAdminEndpoints } from '@/api/auth-admin.js';

export default createClientProxy(AuthAdminEndpoints, authApi);
export const AuthAdminEndpointsProxy = createClientProxy(AuthAdminEndpoints, authApi);
