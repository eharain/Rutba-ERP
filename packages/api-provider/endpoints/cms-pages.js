import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { CmsPagesEndpoints } from '@/api/cms-pages.js';

export default createClientProxy(CmsPagesEndpoints, authApi);
export const CmsPagesEndpointsProxy = createClientProxy(CmsPagesEndpoints, authApi);
