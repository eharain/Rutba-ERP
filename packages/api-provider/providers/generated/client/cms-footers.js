import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
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
export const CmsFootersEndpoints = endpoints;
