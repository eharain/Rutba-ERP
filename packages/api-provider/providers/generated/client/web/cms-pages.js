import { authApi } from '../../../../lib/api.js';
import { executeEndpoint } from '../___core__.js';
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

async function fetchList(...args) {
    return list(...args);
}

async function fetchListByType(...args) {
    return listByType(...args);
}

async function fetchBySlug(...args) {
    return bySlug(...args);
}

const endpoints = {
    list,
    listByType,
    bySlug,
    header,
    fetchList,
    fetchListByType,
    fetchBySlug,
};

export default endpoints;
export const WebCmsPagesEndpoints = endpoints;
