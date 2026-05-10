import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { UploadEndpoints as UploadEndpointsApi } from '../api/upload.js';

const endpoints = createClientProxy(UploadEndpointsApi, authApi);

export default endpoints;
export const UploadEndpoints = endpoints;

