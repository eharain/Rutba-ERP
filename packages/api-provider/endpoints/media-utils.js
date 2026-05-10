import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { MediaUtilsEndpoints as MediaUtilsEndpointsApi } from '../api/media-utils.js';

const endpoints = createClientProxy(MediaUtilsEndpointsApi, authApi);

export default endpoints;
export const MediaUtilsEndpoints = endpoints;

