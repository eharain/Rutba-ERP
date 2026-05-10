import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { MediaLibraryEndpoints as MediaLibraryEndpointsApi } from '../api/media-library.js';

const endpoints = createClientProxy(MediaLibraryEndpointsApi, authApi);

export default endpoints;
export const MediaLibraryEndpoints = endpoints;

