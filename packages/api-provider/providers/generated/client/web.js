import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { WebAuthEndpointRules as WebAuthEndpointRulesApi } from '../../../api/web.js';

const endpoints = {
    localSignIn: WebAuthEndpointRulesApi.localSignIn,
    localRegister: WebAuthEndpointRulesApi.localRegister,
    providerCallback: WebAuthEndpointRulesApi.providerCallback,
};

export default endpoints;
export const WebAuthEndpointRules = endpoints;
