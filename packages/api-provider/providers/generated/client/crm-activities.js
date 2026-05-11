import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { CrmActivitiesEndpoints as CrmActivitiesEndpointsApi } from '../../../api/crm-activities.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', CrmActivitiesEndpointsApi.list(...args));
}

async function fetchList(...args) {
    return list(...args);
}

const endpoints = {
    list,
    fetchList,
};

export default endpoints;
export const CrmActivitiesEndpoints = endpoints;
