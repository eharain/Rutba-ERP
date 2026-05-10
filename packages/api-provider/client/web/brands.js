import { WebBrandsEndpoints } from '@/api/web/brands.js';
import { createWebClientProxy } from './createWebClientProxy.js';

export function createWebBrandsService(config = {}) {
  const proxy = createWebClientProxy(WebBrandsEndpoints, config);

  const getBrands = async () => {
    const res = await proxy.list();
    return res?.data ?? [];
  };

  return { endpoints: proxy, getBrands };
}
