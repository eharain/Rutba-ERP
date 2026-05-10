import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { TermTypesEndpoints as TermTypesEndpointsApi } from '../api/term-types.js';

const endpoints = createClientProxy(TermTypesEndpointsApi, authApi);

export default endpoints;
export const TermTypesEndpoints = endpoints;

