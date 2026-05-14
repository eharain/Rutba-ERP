import { authApi } from '../../../../lib/api.js';
import { withQuery, strictEndpointGuard } from '../___core__.js';
import { WebAuthEndpoints as WebAuthEndpointsApi } from '../../../../api/web/auth.js';

async function localSignIn(data) {
    const ep = WebAuthEndpointsApi.localSignIn(data);
    return authApi.post(withQuery(ep.path, ep.params), ep.data);
}

async function localRegister(data) {
    const ep = WebAuthEndpointsApi.localRegister(data);
    return authApi.post(withQuery(ep.path, ep.params), ep.data);
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
        meta: WebAuthEndpointsApi.meta,
    },
    ["localSignIn","localRegister","providerCallback","meta"],
);

export default endpoints;
export const WebAuthEndpoints = endpoints;
