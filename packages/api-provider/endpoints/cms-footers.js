import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { CmsFootersEndpoints as CmsFootersEndpointsApi } from '../api/cms-footers.js';

const endpoints = createClientProxy(CmsFootersEndpointsApi, authApi);

export default endpoints;
export const CmsFootersEndpoints = endpoints;

