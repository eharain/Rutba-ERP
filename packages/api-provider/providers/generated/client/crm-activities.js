import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { CrmActivitiesEndpoints as CrmActivitiesEndpointsApi } from '../../../api/crm-activities.js';

async function list(arg1 = {}) {
    const ep = CrmActivitiesEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
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
