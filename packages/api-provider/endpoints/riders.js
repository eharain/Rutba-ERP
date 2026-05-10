import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { RidersEndpoints } from '@/api/riders.js';

export default createClientProxy(RidersEndpoints, authApi);
export const RidersEndpointsProxy = createClientProxy(RidersEndpoints, authApi);
