import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { SiteSettingEndpoints } from '@/api/site-setting.js';

export default createClientProxy(SiteSettingEndpoints, authApi);
export const SiteSettingEndpointsProxy = createClientProxy(SiteSettingEndpoints, authApi);
