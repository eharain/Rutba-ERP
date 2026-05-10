import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { CmsPagesEndpoints as CmsPagesEndpointsApi } from '../api/cms-pages.js';

const endpoints = createClientProxy(CmsPagesEndpointsApi, authApi);

export default endpoints;
export const CmsPagesEndpoints = endpoints;

