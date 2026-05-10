import { WebProductGroupsEndpoints } from '@/api/web/product-groups.js';
import { createWebClientProxy } from './createWebClientProxy.js';

export function createWebProductGroupsService(config = {}) {
  const proxy = createWebClientProxy(WebProductGroupsEndpoints, config);

  const getProductGroupBySlug = async (slug, page = 1, pageSize = 24, sort = 'createdAt:desc') => {
    return proxy.bySlug(slug, page, pageSize, sort);
  };

  return { endpoints: proxy, getProductGroupBySlug };
}
