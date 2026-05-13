import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { HrDepartmentsEndpoints as HrDepartmentsEndpointsApi } from '../../../api/hr-departments.js';

async function list(arg1 = {}) {
    const ep = HrDepartmentsEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
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
