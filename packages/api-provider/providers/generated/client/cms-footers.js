import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { CmsFootersEndpoints as CmsFootersEndpointsApi } from '../../../api/cms-footers.js';

async function listDraft(...args) {
    return executeEndpoint(authApi, 'listDraft', CmsFootersEndpointsApi.listDraft(...args));
}

async function listPublished(...args) {
    return executeEndpoint(authApi, 'listPublished', CmsFootersEndpointsApi.listPublished(...args));
}

async function byIdDraft(...args) {
    return executeEndpoint(authApi, 'byIdDraft', CmsFootersEndpointsApi.byIdDraft(...args));
}

async function byIdPublished(...args) {
    return executeEndpoint(authApi, 'byIdPublished', CmsFootersEndpointsApi.byIdPublished(...args));
}

async function updateDraft(...args) {
    return executeEndpoint(authApi, 'updateDraft', CmsFootersEndpointsApi.updateDraft(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', CmsFootersEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', CmsFootersEndpointsApi.unpublish(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', CmsFootersEndpointsApi.create(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', CmsFootersEndpointsApi.del(...args));
}

const endpoints = strictEndpointGuard(
    'CmsFootersEndpoints',
    {
        listDraft,
        listPublished,
        byIdDraft,
        byIdPublished,
        updateDraft,
        publish,
        unpublish,
        create,
        del,
    },
    ["listDraft","listPublished","byIdDraft","byIdPublished","updateDraft","publish","unpublish","create","del"],
);

export default endpoints;
export const CmsFootersEndpoints = endpoints;
