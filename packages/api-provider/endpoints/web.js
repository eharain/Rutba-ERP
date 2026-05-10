import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { WebAuthEndpointRules as WebAuthEndpointRulesApi } from '../api/web.js';

const endpoints = createClientProxy(WebAuthEndpointRulesApi, authApi);

export default endpoints;
export const WebAuthEndpointRules = endpoints;

