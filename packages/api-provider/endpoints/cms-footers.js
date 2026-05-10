import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { CmsFootersEndpoints } from '@/api/cms-footers.js';

export default createClientProxy(CmsFootersEndpoints, authApi);
export const CmsFootersEndpointsProxy = createClientProxy(CmsFootersEndpoints, authApi);
