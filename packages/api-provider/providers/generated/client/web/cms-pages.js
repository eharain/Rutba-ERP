import { authApi } from '../../../../lib/api.js';
import { strictEndpointGuard } from '../___core__.js';
import { WebCmsPagesEndpoints as WebCmsPagesEndpointsApi } from '../../../../api/web/cms-pages.js';

async function list(pageSize = 50) {
    const ep = WebCmsPagesEndpointsApi.list(pageSize);
    return authApi.fetch(ep.path, ep.params);
}

async function listByType(pageType, pageSize = 50) {
    const ep = WebCmsPagesEndpointsApi.listByType(pageType, pageSize);
    return authApi.fetch(ep.path, ep.params);
}

async function bySlug(slug) {
    const ep = WebCmsPagesEndpointsApi.bySlug(slug);
    return authApi.fetch(ep.path, ep.params);
}

async function header() {
    const ep = WebCmsPagesEndpointsApi.header();
    return authApi.fetch(ep.path, ep.params);
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
