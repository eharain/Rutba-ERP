import { authApi } from '../../../../lib/api.js';
import { executeEndpoint } from '../___core__.js';
import { WebBrandsEndpoints as WebBrandsEndpointsApi } from '../../../../api/web/brands.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', WebBrandsEndpointsApi.list(...args));
}

async function fetchList(...args) {
    return list(...args);
}

const endpoints = {
    list,
    fetchList,
};

export default endpoints;
export const WebBrandsEndpoints = endpoints;
