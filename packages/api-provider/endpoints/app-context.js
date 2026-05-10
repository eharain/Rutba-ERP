import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { AppContextEndpoints } from '@/api/app-context.js';

export default createClientProxy(AppContextEndpoints, authApi);
export const AppContextEndpointsProxy = createClientProxy(AppContextEndpoints, authApi);
