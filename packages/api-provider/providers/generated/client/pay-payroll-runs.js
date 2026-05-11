import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { PayPayrollRunsEndpoints as PayPayrollRunsEndpointsApi } from '../../../api/pay-payroll-runs.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', PayPayrollRunsEndpointsApi.list(...args));
}

async function fetchList(...args) {
    return list(...args);
}

const endpoints = {
    list,
    fetchList,
};

export default endpoints;
export const PayPayrollRunsEndpoints = endpoints;
