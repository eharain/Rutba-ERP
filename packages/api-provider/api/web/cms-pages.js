const CMS_LIST_FIELDS = [
  'title', 'slug', 'excerpt', 'page_type', 'sort_order',
  'enable_contact_form', 'createdAt', 'updatedAt', 'publishedAt',
];

const CMS_LIST_POPULATE = ['featured_image', 'background_image'];

export const WebCmsPagesEndpoints = {
  list: (pageSize = 50) => ({
    path: '/cms-pages',
    method: 'get',
    params: {
      sort: ['sort_order:asc', 'createdAt:desc'],
      fields: CMS_LIST_FIELDS,
      populate: CMS_LIST_POPULATE,
      pagination: { pageSize },
    },
  }),

  listByType: (pageType, pageSize = 50) => ({
    path: '/cms-pages',
    method: 'get',
    params: {
      filters: { page_type: { $eq: pageType } },
      sort: ['sort_order:asc', 'createdAt:desc'],
      fields: CMS_LIST_FIELDS,
      populate: CMS_LIST_POPULATE,
      pagination: { pageSize },
    },
  }),

  // The page detail with its full populate tree is now built server-side at
  // /cms-pages/public/by-slug/:slug. `draft: true` returns the draft document
  // and requires authentication on the server.
  bySlug: (slug, { draft } = {}) => ({
    path: `/cms-pages/public/by-slug/${encodeURIComponent(slug)}`,
    method: 'get',
    params: draft ? { draft: true } : {},
  }),

  // Header/navigation data is a subset of the index page detail; the
  // server-built endpoint returns the full tree once and the storefront
  // reads whichever branches it needs.
  header: () => ({
    path: `/cms-pages/public/by-slug/index`,
    method: 'get',
    params: {},
  }),
};
