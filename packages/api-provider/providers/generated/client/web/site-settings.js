import { authApi } from '../../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from '../___core__.js';
import { WebSiteSettingsEndpoints as WebSiteSettingsEndpointsApi } from '../../../../api/web/site-settings.js';

async function get(...args) {
    return executeEndpoint(authApi, 'get', WebSiteSettingsEndpointsApi.get(...args));
}

const endpoints = strictEndpointGuard(
    'WebSiteSettingsEndpoints',
    {
        get,
    },
    ["get"],
);

export default endpoints;
export const WebSiteSettingsEndpoints = endpoints;
