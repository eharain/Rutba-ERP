import { WebBannersEndpoints } from './endpoints';

export function createWebBannersService(config = {}) {
  void config;
  const proxy = WebBannersEndpoints;

  const getBanners = async () => {
    const res = await proxy.homeBanner();
    return res?.data?.[0] ?? null;
  };

  return { endpoints: proxy, getBanners };
}

