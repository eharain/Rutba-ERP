import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { BrandGroupsEndpoints as BrandGroupsEndpointsApi } from '../../../api/brand-groups.js';

async function listDraft(...args) {
    return executeEndpoint(authApi, 'listDraft', BrandGroupsEndpointsApi.listDraft(...args));
}

async function listPublished(...args) {
    return executeEndpoint(authApi, 'listPublished', BrandGroupsEndpointsApi.listPublished(...args));
}

async function list(...args) {
    return executeEndpoint(authApi, 'list', BrandGroupsEndpointsApi.list(...args));
}

async function byIdDraft(...args) {
    return executeEndpoint(authApi, 'byIdDraft', BrandGroupsEndpointsApi.byIdDraft(...args));
}

async function byIdPublished(...args) {
    return executeEndpoint(authApi, 'byIdPublished', BrandGroupsEndpointsApi.byIdPublished(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', BrandGroupsEndpointsApi.byId(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', BrandGroupsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', BrandGroupsEndpointsApi.update(...args));
}

async function updateDraft(...args) {
    return executeEndpoint(authApi, 'updateDraft', BrandGroupsEndpointsApi.updateDraft(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', BrandGroupsEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', BrandGroupsEndpointsApi.unpublish(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', BrandGroupsEndpointsApi.del(...args));
}

const endpoints = strictEndpointGuard(
    'BrandGroupsEndpoints',
    {
        listDraft,
        listPublished,
        list,
        byIdDraft,
        byIdPublished,
        byId,
        create,
        update,
        updateDraft,
        publish,
        unpublish,
        del,
        meta: BrandGroupsEndpointsApi.meta,
    },
    ["listDraft","listPublished","list","byIdDraft","byIdPublished","byId","create","update","updateDraft","publish","unpublish","del","meta"],
);

export default endpoints;
export const BrandGroupsEndpoints = endpoints;
