import { WebProductGroupsEndpoints } from '@rutba/api-provider/endpoints/web/product-groups.js';

export function createWebProductGroupsService(config = {}) {
  void config;
  const proxy = WebProductGroupsEndpoints;

  const getProductGroupBySlug = async (slug, page = 1, pageSize = 24, sort = 'createdAt:desc') => {
    return proxy.bySlug(slug, page, pageSize, sort);
  };

  return { endpoints: proxy, getProductGroupBySlug };
}

