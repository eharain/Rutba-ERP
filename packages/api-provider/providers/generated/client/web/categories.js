import { authApi } from '../../../../lib/api.js';
import { executeEndpoint } from '../___core__.js';
import { WebCategoriesEndpoints as WebCategoriesEndpointsApi } from '../../../../api/web/categories.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', WebCategoriesEndpointsApi.list(...args));
}

async function fetchList(...args) {
    return list(...args);
}

const endpoints = {
    list,
    fetchList,
};

export default endpoints;
export const WebCategoriesEndpoints = endpoints;
