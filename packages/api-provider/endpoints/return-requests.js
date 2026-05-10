import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { ReturnRequestsEndpoints } from '@/api/return-requests.js';

export default createClientProxy(ReturnRequestsEndpoints, authApi);
export const ReturnRequestsEndpointsProxy = createClientProxy(ReturnRequestsEndpoints, authApi);
