import { WebCategoriesEndpoints } from './endpoints';

export function createWebCategoriesService(config = {}) {
  void config;
  const proxy = WebCategoriesEndpoints;

  const getCategories = async () => {
    const res = await proxy.list();
    return res?.data ?? [];
  };

  return { endpoints: proxy, getCategories };
}

