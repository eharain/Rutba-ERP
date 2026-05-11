import { authApi } from '../../../../lib/api.js';
import { executeEndpoint } from '../___core__.js';
import { WebBannersEndpoints as WebBannersEndpointsApi } from '../../../../api/web/banners.js';

async function homeBanner(...args) {
    return executeEndpoint(authApi, 'homeBanner', WebBannersEndpointsApi.homeBanner(...args));
}

const endpoints = {
    homeBanner,
};

export default endpoints;
export const WebBannersEndpoints = endpoints;
