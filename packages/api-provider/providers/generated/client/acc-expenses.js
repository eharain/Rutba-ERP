import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { AccExpensesEndpoints as AccExpensesEndpointsApi } from '../../../api/acc-expenses.js';

async function list(...args) {
    return executeEndpoint(authApi, 'list', AccExpensesEndpointsApi.list(...args));
}

async function fetchList(...args) {
    return list(...args);
}

const endpoints = {
    list,
    fetchList,
};

export default endpoints;
export const AccExpensesEndpoints = endpoints;
