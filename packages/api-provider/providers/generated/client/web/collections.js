import { authApi } from '../../../../lib/api.js';
import { executeEndpoint } from '../___core__.js';
import { WebCollectionsEndpoints as WebCollectionsEndpointsApi } from '../../../../api/web/collections.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', WebCollectionsEndpointsApi.list(...args));
}

async function fetchList(...args) {
    return list(...args);
}

const endpoints = {
    list,
    fetchList,
};

export default endpoints;
export const WebCollectionsEndpoints = endpoints;
