import { authApi } from '../../../../lib/api.js';
import { withQuery, wrapData, strictEndpointGuard } from '../___core__.js';
import { WebCheckoutEndpoints as WebCheckoutEndpointsApi } from '../../../../api/web/checkout.js';

async function validateAddress(data) {
    const ep = WebCheckoutEndpointsApi.validateAddress(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

async function shippingRate(data) {
    const ep = WebCheckoutEndpointsApi.shippingRate(data);
    return authApi.post(withQuery(ep.path, ep.params), wrapData(ep.data));
}

const endpoints = strictEndpointGuard(
    'WebCheckoutEndpoints',
    {
        validateAddress,
        shippingRate,
    },
    ["validateAddress","shippingRate"],
);

export default endpoints;
export const WebCheckoutEndpoints = endpoints;
