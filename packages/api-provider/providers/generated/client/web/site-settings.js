import { api } from '../../../../lib/api.js';
import { strictEndpointGuard } from '../___core__.js';
import { WebSiteSettingsEndpoints as WebSiteSettingsEndpointsApi } from '../../../../api/web/site-settings.js';

async function get() {
    const ep = WebSiteSettingsEndpointsApi.get();
    return api.fetch(ep.path, ep.params);
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
