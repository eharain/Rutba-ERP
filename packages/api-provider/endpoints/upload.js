import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { UploadEndpoints } from '@/api/upload.js';

export default createClientProxy(UploadEndpoints, authApi);
export const UploadEndpointsProxy = createClientProxy(UploadEndpoints, authApi);
