import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { CategoryGroupsEndpoints as CategoryGroupsEndpointsApi } from '../../../api/category-groups.js';

async function listDraft(...args) {
    return executeEndpoint(authApi, 'listDraft', CategoryGroupsEndpointsApi.listDraft(...args));
}

async function listPublished(...args) {
    return executeEndpoint(authApi, 'listPublished', CategoryGroupsEndpointsApi.listPublished(...args));
}

async function byIdDraft(...args) {
    return executeEndpoint(authApi, 'byIdDraft', CategoryGroupsEndpointsApi.byIdDraft(...args));
}

async function byIdPublished(...args) {
    return executeEndpoint(authApi, 'byIdPublished', CategoryGroupsEndpointsApi.byIdPublished(...args));
}

async function updateDraft(...args) {
    return executeEndpoint(authApi, 'updateDraft', CategoryGroupsEndpointsApi.updateDraft(...args));
}

async function publish(...args) {
    return executeEndpoint(authApi, 'publish', CategoryGroupsEndpointsApi.publish(...args));
}

async function unpublish(...args) {
    return executeEndpoint(authApi, 'unpublish', CategoryGroupsEndpointsApi.unpublish(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', CategoryGroupsEndpointsApi.create(...args));
}

async function del(...args) {
    return executeEndpoint(authApi, 'del', CategoryGroupsEndpointsApi.del(...args));
}

const endpoints = strictEndpointGuard(
    'CategoryGroupsEndpoints',
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
export const CategoryGroupsEndpoints = endpoints;
