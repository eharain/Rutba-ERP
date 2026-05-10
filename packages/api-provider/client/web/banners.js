import { WebBannersEndpoints } from '@/api/web/banners.js';
import { createWebClientProxy } from './createWebClientProxy.js';

export function createWebBannersService(config = {}) {
  const proxy = createWebClientProxy(WebBannersEndpoints, config);

  const getBanners = async () => {
    const res = await proxy.homeBanner();
    return res?.data?.[0] ?? null;
  };

  return { endpoints: proxy, getBanners };
}
