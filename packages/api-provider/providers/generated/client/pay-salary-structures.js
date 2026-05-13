import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { PaySalaryStructuresEndpoints as PaySalaryStructuresEndpointsApi } from '../../../api/pay-salary-structures.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', PaySalaryStructuresEndpointsApi.list(...args));
}

const endpoints = strictEndpointGuard(
    'PaySalaryStructuresEndpoints',
    {
        list,
    },
    ["list"],
);

export default endpoints;
export const PaySalaryStructuresEndpoints = endpoints;
