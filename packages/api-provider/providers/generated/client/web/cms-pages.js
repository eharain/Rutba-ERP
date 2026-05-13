import { authApi } from '../../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from '../___core__.js';
import { WebCmsPagesEndpoints as WebCmsPagesEndpointsApi } from '../../../../api/web/cms-pages.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', WebCmsPagesEndpointsApi.list(...args));
}

async function listByType(...args) {
    return executeEndpoint(authApi, 'listByType', WebCmsPagesEndpointsApi.listByType(...args));
}

async function bySlug(...args) {
    return executeEndpoint(authApi, 'bySlug', WebCmsPagesEndpointsApi.bySlug(...args));
}

async function header(...args) {
    return executeEndpoint(authApi, 'header', WebCmsPagesEndpointsApi.header(...args));
}

const endpoints = strictEndpointGuard(
    'WebCmsPagesEndpoints',
    {
        list,
        listByType,
        bySlug,
        header,
    },
    ["list","listByType","bySlug","header"],
);

export default endpoints;
export const WebCmsPagesEndpoints = endpoints;
