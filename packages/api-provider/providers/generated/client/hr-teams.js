import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { HrTeamsEndpoints as HrTeamsEndpointsApi } from '../../../api/hr-teams.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', HrTeamsEndpointsApi.list(...args));
}

async function appRoleOptions(...args) {
    return executeEndpoint(authApi, 'appRoleOptions', HrTeamsEndpointsApi.appRoleOptions(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', HrTeamsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', HrTeamsEndpointsApi.update(...args));
}

async function fetchList(...args) {
    return list(...args);
}

async function postCreate(...args) {
    return create(...args);
}

async function putUpdate(...args) {
    return update(...args);
}

const endpoints = {
    list,
    appRoleOptions,
    create,
    update,
    fetchList,
    postCreate,
    putUpdate,
};

export default endpoints;
export const HrTeamsEndpoints = endpoints;
