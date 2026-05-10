import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { SaleOffersEndpoints as SaleOffersEndpointsApi } from '../api/sale-offers.js';

const endpoints = createClientProxy(SaleOffersEndpointsApi, authApi);

export default endpoints;
export const SaleOffersEndpoints = endpoints;

