import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { CmsPagesEndpoints as CmsPagesEndpointsApi } from '../../../api/cms-pages.js';

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

async function fetchListDraft(...args) {
    return listDraft(...args);
}

async function fetchListPublished(...args) {
    return listPublished(...args);
}

async function fetchBySlug(...args) {
    return bySlug(...args);
}

async function fetchBySlugCheck(...args) {
    return bySlugCheck(...args);
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
    bySlug,
    bySlugCheck,
    headerData,
    byIdDraft,
    byIdPublished,
    fetchListDraft,
    fetchListPublished,
    fetchBySlug,
    fetchBySlugCheck,
    fetchByIdDraft,
    fetchByIdPublished,
    meta: CmsPagesEndpointsApi.meta,
};

export default endpoints;
export const CmsPagesEndpoints = endpoints;
