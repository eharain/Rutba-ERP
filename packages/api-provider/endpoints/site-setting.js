import { authApi } from '../lib/api.js';
import { createClientProxy } from '../providers/createClientProxy.js';
import { SiteSettingEndpoints as SiteSettingEndpointsApi } from '../api/site-setting.js';

const endpoints = createClientProxy(SiteSettingEndpointsApi, authApi);

export default endpoints;
export const SiteSettingEndpoints = endpoints;

