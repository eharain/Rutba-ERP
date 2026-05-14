import { authApi } from '../../../lib/api.js';
import { strictEndpointGuard } from './___core__.js';
import { PaySalaryStructuresEndpoints as PaySalaryStructuresEndpointsApi } from '../../../api/pay-salary-structures.js';

async function list(arg1 = {}) {
    const ep = PaySalaryStructuresEndpointsApi.list(arg1);
    return authApi.fetch(ep.path, ep.params);
}

const endpoints = strictEndpointGuard(
    'PaySalaryStructuresEndpoints',
    {
        list,
        meta: PaySalaryStructuresEndpointsApi.meta,
    },
    ["list","meta"],
);

export default endpoints;
export const PaySalaryStructuresEndpoints = endpoints;
