import { authApi } from '../../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from '../___core__.js';
import { WebAuthEndpoints as WebAuthEndpointsApi } from '../../../../api/web/auth.js';

async function localSignIn() {
    const ep = WebAuthEndpointsApi.localSignIn();
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function localRegister() {
    const ep = WebAuthEndpointsApi.localRegister();
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function providerCallback(provider, accessToken) {
    const ep = WebAuthEndpointsApi.providerCallback(provider, accessToken);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'WebAuthEndpoints',
    {
        localSignIn,
        localRegister,
        providerCallback,
    },
    ["localSignIn","localRegister","providerCallback"],
);

export default endpoints;
export const WebAuthEndpoints = endpoints;
