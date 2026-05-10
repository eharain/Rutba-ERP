import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { WebAuthEndpointRules } from '@/api/web.js';

export default createClientProxy(WebAuthEndpointRules, authApi);
export const WebAuthEndpointRulesProxy = createClientProxy(WebAuthEndpointRules, authApi);
