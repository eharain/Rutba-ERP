import { WebBrandsEndpoints } from './endpoints';

export function createWebBrandsService(config = {}) {
  void config;
  const proxy = WebBrandsEndpoints;

  const getBrands = async () => {
    const res = await proxy.list();
    return res?.data ?? [];
  };

  return { endpoints: proxy, getBrands };
}

