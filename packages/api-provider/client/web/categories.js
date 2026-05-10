import { WebCategoriesEndpoints } from '../../api/web/categories.js';
import { createWebClientProxy } from './createWebClientProxy.js';

export function createWebCategoriesService(config = {}) {
  const proxy = createWebClientProxy(WebCategoriesEndpoints, config);

  const getCategories = async () => {
    const res = await proxy.list();
    return res?.data ?? [];
  };

  return { endpoints: proxy, getCategories };
}

