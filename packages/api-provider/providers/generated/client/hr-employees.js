import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { HrEmployeesEndpoints as HrEmployeesEndpointsApi } from '../../../api/hr-employees.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', HrEmployeesEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', HrEmployeesEndpointsApi.byId(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', HrEmployeesEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', HrEmployeesEndpointsApi.update(...args));
}

const endpoints = strictEndpointGuard(
    'HrEmployeesEndpoints',
    {
        list,
        byId,
        create,
        update,
    },
    ["list","byId","create","update"],
);

export default endpoints;
export const HrEmployeesEndpoints = endpoints;
