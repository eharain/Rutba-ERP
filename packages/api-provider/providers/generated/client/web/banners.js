import { api } from '../../../../lib/api.js';
import { strictEndpointGuard } from '../___core__.js';
import { WebBannersEndpoints as WebBannersEndpointsApi } from '../../../../api/web/banners.js';

async function homeBanner() {
    const ep = WebBannersEndpointsApi.homeBanner();
    return api.fetch(ep.path, ep.params);
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
