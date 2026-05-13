export const WebProductGroupsEndpoints = {
  bySlug: (slug, page = 1, pageSize = 24, sort = 'createdAt:desc') => ({
    path: `/product-groups/by-slug/${encodeURIComponent(slug)}`,
    method: 'get',
    params: { page, pageSize, sort },
  }),
};
