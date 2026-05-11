import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
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

async function fetchList(...args) {
    return list(...args);
}

async function fetchById(...args) {
    return byId(...args);
}

async function postCreate(...args) {
    return create(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

const endpoints = {
    list,
    byId,
    create,
    update,
    fetchList,
    fetchById,
    postCreate,
    putUpdate,
};

export default endpoints;
export const HrEmployeesEndpoints = endpoints;
