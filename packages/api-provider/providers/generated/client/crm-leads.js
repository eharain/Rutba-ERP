import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { CrmLeadsEndpoints as CrmLeadsEndpointsApi } from '../../../api/crm-leads.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', CrmLeadsEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', CrmLeadsEndpointsApi.byId(...args));
}

async function create(...args) {
    return executeEndpoint(authApi, 'create', CrmLeadsEndpointsApi.create(...args));
}

async function update(...args) {
    return executeEndpoint(authApi, 'update', CrmLeadsEndpointsApi.update(...args));
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
    meta: CrmLeadsEndpointsApi.meta,
};

export default endpoints;
export const CrmLeadsEndpoints = endpoints;
