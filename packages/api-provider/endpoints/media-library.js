import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/lib/providers/createClientProxy.js';
import { MediaLibraryEndpoints } from '@/api/media-library.js';

export default createClientProxy(MediaLibraryEndpoints, authApi);
export const MediaLibraryEndpointsProxy = createClientProxy(MediaLibraryEndpoints, authApi);
