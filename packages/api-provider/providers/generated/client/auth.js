import { authApi } from '../../../lib/api.js';
import { withQuery, epCtx, strictEndpointGuard } from './___core__.js';
import { AuthEndpoints as AuthEndpointsApi } from '../../../api/auth.js';

async function forgotPassword(email) {
    const ep = AuthEndpointsApi.forgotPassword(email);
    return authApi.post(withQuery(ep.path, ep.params), ep.data, epCtx(ep));
}

async function resetPassword(arg1) {
    const ep = AuthEndpointsApi.resetPassword(arg1);
    return authApi.post(withQuery(ep.path, ep.params), ep.data, epCtx(ep));
}

const endpoints = strictEndpointGuard(
    'AuthEndpoints',
    {
        forgotPassword,
        resetPassword,
        meta: AuthEndpointsApi.meta,
    },
    ["forgotPassword","resetPassword","meta"],
);

export default endpoints;
export const AuthEndpoints = endpoints;
