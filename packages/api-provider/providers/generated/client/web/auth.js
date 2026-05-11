import { authApi } from '../../../../lib/api.js';
import { executeEndpoint } from '../___core__.js';
import { WebAuthEndpoints as WebAuthEndpointsApi } from '../../../../api/web/auth.js';

async function localSignIn(...args) {
    return executeEndpoint(authApi, 'localSignIn', WebAuthEndpointsApi.localSignIn(...args));
}

async function localRegister(...args) {
    return executeEndpoint(authApi, 'localRegister', WebAuthEndpointsApi.localRegister(...args));
}

async function providerCallback(...args) {
    return executeEndpoint(authApi, 'providerCallback', WebAuthEndpointsApi.providerCallback(...args));
}

const endpoints = {
    localSignIn,
    localRegister,
    providerCallback,
};

export default endpoints;
export const WebAuthEndpoints = endpoints;
