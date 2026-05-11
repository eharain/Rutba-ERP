import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { CrmContactsEndpoints as CrmContactsEndpointsApi } from '../../../api/crm-contacts.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', CrmContactsEndpointsApi.list(...args));
}

async function byId(...args) {
    return executeEndpoint(authApi, 'byId', CrmContactsEndpointsApi.byId(...args));
}

async function fetchList(...args) {
    return list(...args);
}

async function fetchById(...args) {
    return byId(...args);
}

const endpoints = {
    list,
    byId,
    fetchList,
    fetchById,
};

export default endpoints;
export const CrmContactsEndpoints = endpoints;
