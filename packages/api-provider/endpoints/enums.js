import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { EnumsEndpoints } from '@/api/enums.js';

export default createClientProxy(EnumsEndpoints, authApi);
export const EnumsEndpointsProxy = createClientProxy(EnumsEndpoints, authApi);
