export const WebCmsPageGroupsEndpoints = {
  // The page-group detail with its member pages + images is built server-side
  // at /cms-page-groups/public/by-slug/:slug (published only).
  bySlug: (slug) => ({
    path: `/cms-page-groups/public/by-slug/${encodeURIComponent(slug)}`,
    method: 'get',
    params: {},
  }),
};
