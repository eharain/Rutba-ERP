export const WebCmsMenusEndpoints = {
  // Every enabled menu, resolved server-side into a clean { label, href,
  // children } nav tree. One call returns all positions; the storefront
  // selects the position(s) it needs (top / side / footer).
  list: () => ({
    path: '/cms-menus/public',
    method: 'get',
    params: {},
  }),
};
