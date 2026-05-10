import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { WebOrdersEndpoints } from '@/api/web-orders.js';

export default createClientProxy(WebOrdersEndpoints, authApi);
export const WebOrdersEndpointsProxy = createClientProxy(WebOrdersEndpoints, authApi);
