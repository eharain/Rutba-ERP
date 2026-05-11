import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { StockHelpersEndpoints as StockHelpersEndpointsApi } from '../../../api/stock-helpers.js';

async function getStockStatus(...args) {
    return executeEndpoint(authApi, 'getStockStatus', StockHelpersEndpointsApi.getStockStatus(...args));
}

async function relationConnects(...args) {
    return executeEndpoint(authApi, 'relationConnects', StockHelpersEndpointsApi.relationConnects(...args));
}

async function fetchGetStockStatus(...args) {
    return getStockStatus(...args);
}

const endpoints = {
    getStockStatus,
    relationConnects,
    fetchGetStockStatus,
};

export default endpoints;
export const StockHelpersEndpoints = endpoints;
