import { authApi } from '../../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from '../___core__.js';
import { WebCheckoutEndpoints as WebCheckoutEndpointsApi } from '../../../../api/web/checkout.js';

async function validateAddress(...args) {
    return executeEndpoint(authApi, 'validateAddress', WebCheckoutEndpointsApi.validateAddress(...args));
}

async function shippingRate(...args) {
    return executeEndpoint(authApi, 'shippingRate', WebCheckoutEndpointsApi.shippingRate(...args));
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
