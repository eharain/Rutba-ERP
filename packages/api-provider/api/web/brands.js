export const WebBrandsEndpoints = {
  // Server-side controller returns only brands pinned via a published
  // brand-group. Populate tree + filters live on the server now, so the
  // storefront just hits a flat endpoint.
  list: () => ({
    path: '/brands/public/list',
    method: 'get',
    params: {},
  }),
};
