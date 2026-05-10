import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { TermsEndpoints as TermsEndpointsApi } from '../api/terms.js';

const endpoints = createClientProxy(TermsEndpointsApi, authApi);

export default endpoints;
export const TermsEndpoints = endpoints;

