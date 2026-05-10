import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { AuthEndpoints } from '@/api/auth.js';

export default createClientProxy(AuthEndpoints, authApi);
export const AuthEndpointsProxy = createClientProxy(AuthEndpoints, authApi);
