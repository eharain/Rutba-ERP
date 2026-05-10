import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { TermsEndpoints } from '@/api/terms.js';

export default createClientProxy(TermsEndpoints, authApi);
export const TermsEndpointsProxy = createClientProxy(TermsEndpoints, authApi);
