import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { PaySalaryStructuresEndpoints as PaySalaryStructuresEndpointsApi } from '../../../api/pay-salary-structures.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', PaySalaryStructuresEndpointsApi.list(...args));
}

async function fetchList(...args) {
    return list(...args);
}

const endpoints = {
    list,
    fetchList,
};

export default endpoints;
export const PaySalaryStructuresEndpoints = endpoints;
