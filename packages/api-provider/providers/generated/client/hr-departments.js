import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { HrDepartmentsEndpoints as HrDepartmentsEndpointsApi } from '../../../api/hr-departments.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', HrDepartmentsEndpointsApi.list(...args));
}

const endpoints = strictEndpointGuard(
    'HrDepartmentsEndpoints',
    {
        list,
    },
    ["list"],
);

export default endpoints;
export const HrDepartmentsEndpoints = endpoints;
