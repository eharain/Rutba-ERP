import { authApi } from '../../../../lib/api.js';
import { executeEndpoint } from '../___core__.js';
import { WebSiteSettingsEndpoints as WebSiteSettingsEndpointsApi } from '../../../../api/web/site-settings.js';

async function get(...args) {
    return executeEndpoint(authApi, 'get', WebSiteSettingsEndpointsApi.get(...args));
}

async function fetchGet(...args) {
    return get(...args);
}

const endpoints = {
    get,
    fetchGet,
};

export default endpoints;
export const WebSiteSettingsEndpoints = endpoints;
