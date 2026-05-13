import { authApi } from '../../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from '../___core__.js';
import { WebBannersEndpoints as WebBannersEndpointsApi } from '../../../../api/web/banners.js';

async function homeBanner(...args) {
    return executeEndpoint(authApi, 'homeBanner', WebBannersEndpointsApi.homeBanner(...args));
}

const endpoints = strictEndpointGuard(
    'WebBannersEndpoints',
    {
        homeBanner,
    },
    ["homeBanner"],
);

export default endpoints;
export const WebBannersEndpoints = endpoints;
