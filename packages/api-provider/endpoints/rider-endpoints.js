import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { RiderEndpoints } from '@/api/rider-endpoints.js';

export default createClientProxy(RiderEndpoints, authApi);
export const RiderEndpointsProxy = createClientProxy(RiderEndpoints, authApi);
