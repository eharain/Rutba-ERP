import { authApi } from '../../../lib/api.js';
import { executeEndpoint, strictEndpointGuard } from './___core__.js';
import { StockHelpersEndpoints as StockHelpersEndpointsApi } from '../../../api/stock-helpers.js';

async function getStockStatus(...args) {
    return executeEndpoint(authApi, 'getStockStatus', StockHelpersEndpointsApi.getStockStatus(...args));
}

async function relationConnects(...args) {
    return executeEndpoint(authApi, 'relationConnects', StockHelpersEndpointsApi.relationConnects(...args));
}

const endpoints = strictEndpointGuard(
    'StockHelpersEndpoints',
    {
        getStockStatus,
        relationConnects,
    },
    ["getStockStatus","relationConnects"],
);

export default endpoints;
export const StockHelpersEndpoints = endpoints;
