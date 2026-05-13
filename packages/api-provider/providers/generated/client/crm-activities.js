import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { CrmActivitiesEndpoints as CrmActivitiesEndpointsApi } from '../../../api/crm-activities.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', CrmActivitiesEndpointsApi.list(...args));
}

const endpoints = strictEndpointGuard(
    'CrmActivitiesEndpoints',
    {
        list,
    },
    ["list"],
);

export default endpoints;
export const CrmActivitiesEndpoints = endpoints;
