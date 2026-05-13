import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { CmsPagesEndpoints as CmsPagesEndpointsApi } from '../../../api/cms-pages.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', CmsPagesEndpointsApi.list(...args));
}

async function listDraft(...args) {
    return executeEndpoint(authApi, 'listDraft', CmsPagesEndpointsApi.listDraft(...args));
}

async function listPublished(...args) {
    return executeEndpoint(authApi, 'listPublished', CmsPagesEndpointsApi.listPublished(...args));
}

async function bySlug(...args) {
    return executeEndpoint(authApi, 'bySlug', CmsPagesEndpointsApi.bySlug(...args));
}

async function bySlugCheck(...args) {
    return executeEndpoint(authApi, 'bySlugCheck', CmsPagesEndpointsApi.bySlugCheck(...args));
}

async function headerData(...args) {
    return executeEndpoint(authApi, 'headerData', CmsPagesEndpointsApi.headerData(...args));
}

async function byIdDraft(...args) {
    return executeEndpoint(authApi, 'byIdDraft', CmsPagesEndpointsApi.byIdDraft(...args));
}

async function byIdPublished(...args) {
    return executeEndpoint(authApi, 'byIdPublished', CmsPagesEndpointsApi.byIdPublished(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', CmsPagesEndpointsApi.update(...args));
}

async function updateDraft(...args) {
    return executeEndpoint(authApi, 'updateDraft', CmsPagesEndpointsApi.updateDraft(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', CmsPagesEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', CmsPagesEndpointsApi.unpublish(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', CmsPagesEndpointsApi.create(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', CmsPagesEndpointsApi.del(...args));
}

const endpoints = strictEndpointGuard(
    'CmsPagesEndpoints',
    {
        list,
        listDraft,
        listPublished,
        bySlug,
        bySlugCheck,
        headerData,
        byIdDraft,
        byIdPublished,
        update,
        updateDraft,
        publish,
        unpublish,
        create,
        del,
        meta: CmsPagesEndpointsApi.meta,
    },
    ["list","listDraft","listPublished","bySlug","bySlugCheck","headerData","byIdDraft","byIdPublished","update","updateDraft","publish","unpublish","create","del","meta"],
);

export default endpoints;
export const CmsPagesEndpoints = endpoints;
