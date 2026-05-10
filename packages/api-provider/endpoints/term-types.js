import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { TermTypesEndpoints } from '@/api/term-types.js';

export default createClientProxy(TermTypesEndpoints, authApi);
export const TermTypesEndpointsProxy = createClientProxy(TermTypesEndpoints, authApi);
