import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { EnumsEndpoints as EnumsEndpointsApi } from '../../../api/enums.js';

async function values(...args) {
    return executeEndpoint(authApi, 'values', EnumsEndpointsApi.values(...args));
}

const endpoints = {
    values,
    meta: EnumsEndpointsApi.meta,
};

export default endpoints;
export const EnumsEndpoints = endpoints;
