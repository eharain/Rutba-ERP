import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { HrDepartmentsEndpoints as HrDepartmentsEndpointsApi } from '../../../api/hr-departments.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', HrDepartmentsEndpointsApi.list(...args));
}

async function fetchList(...args) {
    return list(...args);
}

const endpoints = {
    list,
    fetchList,
};

export default endpoints;
export const HrDepartmentsEndpoints = endpoints;
