import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { MediaUtilsEndpoints } from '@/api/media-utils.js';

export default createClientProxy(MediaUtilsEndpoints, authApi);
export const MediaUtilsEndpointsProxy = createClientProxy(MediaUtilsEndpoints, authApi);
