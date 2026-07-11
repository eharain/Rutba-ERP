import { webApi } from '../../../../lib/api.js';
import { withQuery, strictEndpointGuard } from '../___core__.js';
import { WebAuthEndpoints as WebAuthEndpointsApi } from '../../../../api/web/auth.js';

async function localSignIn(data) {
    const ep = WebAuthEndpointsApi.localSignIn(data);
    return webApi.post(withQuery(ep.path, ep.params), ep.data);
}

async function localRegister(data) {
    const ep = WebAuthEndpointsApi.localRegister(data);
    return webApi.post(withQuery(ep.path, ep.params), ep.data);
}

async function providerCallback(provider, accessToken) {
    const ep = WebAuthEndpointsApi.providerCallback(provider, accessToken);
    return webApi.fetch(ep.path, ep.params);
}

async function forgotPassword(data) {
    const ep = WebAuthEndpointsApi.forgotPassword(data);
    return webApi.post(withQuery(ep.path, ep.params), ep.data);
}

async function resetPassword(data) {
    const ep = WebAuthEndpointsApi.resetPassword(data);
    return webApi.post(withQuery(ep.path, ep.params), ep.data);
}

async function sendEmailConfirmation(data) {
    const ep = WebAuthEndpointsApi.sendEmailConfirmation(data);
    return webApi.post(withQuery(ep.path, ep.params), ep.data);
}

const endpoints = strictEndpointGuard(
    'WebAuthEndpoints',
    {
        localSignIn,
        localRegister,
        providerCallback,
        forgotPassword,
        resetPassword,
        sendEmailConfirmation,
        meta: WebAuthEndpointsApi.meta,
    },
    ["localSignIn","localRegister","providerCallback","forgotPassword","resetPassword","sendEmailConfirmation","meta"],
);

export default endpoints;
export const WebAuthEndpoints = endpoints;
