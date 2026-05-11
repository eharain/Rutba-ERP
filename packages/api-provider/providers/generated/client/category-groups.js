import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
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

async function fetchListDraft(...args) {
    return listDraft(...args);
}

async function fetchListPublished(...args) {
    return listPublished(...args);
}

async function fetchByIdDraft(...args) {
    return byIdDraft(...args);
}

async function fetchByIdPublished(...args) {
    return byIdPublished(...args);
}

const endpoints = {
    listDraft,
    listPublished,
    byIdDraft,
    byIdPublished,
    fetchListDraft,
    fetchListPublished,
    fetchByIdDraft,
    fetchByIdPublished,
};

export default endpoints;
export const CategoryGroupsEndpoints = endpoints;
